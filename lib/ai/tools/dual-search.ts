import { tool, DataStreamWriter } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { fetchFileSearch } from './file-search';
import { fetchTavilyFileSearch } from './tavily-file-search';

interface DualSearchProps {
  session: Session;
  dataStream: DataStreamWriter;
}

/**
 * Composite tool that searches both file database and Tavily in sequence
 * First searches the file database, then Tavily, and combines results
 */
export const dualSearchTool = ({ session, dataStream }: DualSearchProps) => tool({
  description: `Search for information using both file database (vector search) and VinUni policy documents (Tavily search) in sequence. This tool provides comprehensive results by first checking internal files, then external VinUni policy documents.`,
  parameters: z.object({
    query: z.string().describe('The search query to find relevant answers from both file database and VinUni policy documents.')
  }),
  execute: async ({ query }) => {
    try {
      let combinedAnswer = '';
      let combinedCitations: Array<{ title: string; url: string | null }> = [];
      let hasFileResults = false;
      let hasTavilyResults = false;

      // Step 1: Search file database first
      dataStream?.writeData({
        type: 'tool-progress',
        content: { step: 'file-search-start', message: 'Searching internal file database...' }
      });

      const vectorStoreId = process.env.VECTOR_STORE_ID;
      let fileSearchResults = null;

      if (vectorStoreId) {
        try {
          fileSearchResults = await fetchFileSearch({ query, vectorStoreId });
          
          // Check if we got meaningful results from file search
          if (fileSearchResults && 
              fileSearchResults.answer && 
              fileSearchResults.answer !== "I'm sorry, but I can only assist with questions related to VinUni-related topics." &&
              fileSearchResults.answer !== "An unexpected error has occurred. Please refresh the page, delete this chat or try again later!") {
            
            hasFileResults = true;
            combinedAnswer += `## File Database Results\n\n${fileSearchResults.answer}`;
            
            if (fileSearchResults.citations && fileSearchResults.citations.length > 0) {
              combinedCitations.push(...fileSearchResults.citations);
            }
            
            dataStream?.writeData({
              type: 'tool-progress',
              content: { 
                step: 'file-search-complete', 
                message: `Found ${fileSearchResults.citations?.length || 0} file citations`,
                resultsFound: true
              }
            });
          } else {
            dataStream?.writeData({
              type: 'tool-progress',
              content: { 
                step: 'file-search-complete', 
                message: 'No relevant results found in file database',
                resultsFound: false
              }
            });
          }
        } catch (error) {
          console.error("File search failed in dual search:", error);
          dataStream?.writeData({
            type: 'tool-progress',
            content: { 
              step: 'file-search-error', 
              message: 'File search encountered an error, continuing with Tavily search...'
            }
          });
        }
      } else {
        dataStream?.writeData({
          type: 'tool-progress',
          content: { 
            step: 'file-search-skip', 
            message: 'File search unavailable (missing VECTOR_STORE_ID), proceeding to Tavily search...'
          }
        });
      }

      // Step 2: Search Tavily documents
      dataStream?.writeData({
        type: 'tool-progress',
        content: { step: 'tavily-search-start', message: 'Searching VinUni policy documents...' }
      });

      let tavilyResults = null;

      if (process.env.TAVILY_API_KEY) {
        try {
          tavilyResults = await fetchTavilyFileSearch({ query, dataStream });
          
          // Check if we got meaningful results from Tavily
          if (tavilyResults && 
              tavilyResults.answer && 
              !tavilyResults.denied &&
              tavilyResults.answer !== "An unexpected error has occurred. Please refresh the page, delete this chat or try again later!") {
            
            hasTavilyResults = true;
            
            if (hasFileResults) {
              combinedAnswer += `\n\n## VinUni Policy Documents\n\n${tavilyResults.answer}`;
            } else {
              combinedAnswer = tavilyResults.answer;
            }
            
            if (tavilyResults.citations && tavilyResults.citations.length > 0) {
              combinedCitations.push(...tavilyResults.citations);
            }
            
            dataStream?.writeData({
              type: 'tool-progress',
              content: { 
                step: 'tavily-search-complete', 
                message: `Found ${tavilyResults.citations?.length || 0} policy document citations`,
                resultsFound: true
              }
            });
          } else if (tavilyResults?.denied) {
            dataStream?.writeData({
              type: 'tool-progress',
              content: { 
                step: 'tavily-search-denied', 
                message: 'Query not related to VinUni topics',
                resultsFound: false
              }
            });
            
            // If query was denied and we have no file results, return the denial
            if (!hasFileResults) {
              return {
                answer: tavilyResults.answer,
                citations: [],
                denied: true
              };
            }
          } else {
            dataStream?.writeData({
              type: 'tool-progress',
              content: { 
                step: 'tavily-search-complete', 
                message: 'No relevant results found in VinUni policy documents',
                resultsFound: false
              }
            });
          }
        } catch (error) {
          console.error("Tavily search failed in dual search:", error);
          dataStream?.writeData({
            type: 'tool-progress',
            content: { 
              step: 'tavily-search-error', 
              message: 'Tavily search encountered an error'
            }
          });
        }
      } else {
        dataStream?.writeData({
          type: 'tool-progress',
          content: { 
            step: 'tavily-search-skip', 
            message: 'Tavily search unavailable (missing TAVILY_API_KEY)'
          }
        });
      }

      // Step 3: Combine and return results
      dataStream?.writeData({
        type: 'tool-progress',
        content: { 
          step: 'combining-results', 
          message: 'Combining search results...',
          fileResults: hasFileResults,
          tavilyResults: hasTavilyResults,
          totalCitations: combinedCitations.length
        }
      });

      // Handle different result scenarios
      if (!hasFileResults && !hasTavilyResults) {
        return {
          answer: "I couldn't find relevant information in either the file database or VinUni policy documents. Please try rephrasing your question or asking about other VinUni-related topics.",
          citations: [],
          searchStats: {
            fileSearchCompleted: vectorStoreId ? true : false,
            tavilySearchCompleted: process.env.TAVILY_API_KEY ? true : false,
            totalSources: 0
          }
        };
      }

      if (hasFileResults && hasTavilyResults) {
        combinedAnswer += `\n\n---\n\n*Results compiled from ${fileSearchResults?.citations?.length || 0} file sources and ${tavilyResults?.citations?.length || 0} policy document sources.*`;
      } else if (hasFileResults) {
        combinedAnswer += `\n\n*Results from file database (${fileSearchResults?.citations?.length || 0} sources). Policy documents search ${process.env.TAVILY_API_KEY ? 'found no additional relevant information.' : 'was unavailable.'}*`;
      } else if (hasTavilyResults) {
        combinedAnswer += `\n\n*Results from VinUni policy documents (${tavilyResults?.citations?.length || 0} sources). File database search ${vectorStoreId ? 'found no relevant information.' : 'was unavailable.'}*`;
      }

      return {
        answer: combinedAnswer,
        citations: combinedCitations,
        searchStats: {
          fileSearchCompleted: vectorStoreId ? true : false,
          tavilySearchCompleted: process.env.TAVILY_API_KEY ? true : false,
          fileResultsFound: hasFileResults,
          tavilyResultsFound: hasTavilyResults,
          fileCitations: fileSearchResults?.citations?.length || 0,
          tavilyCitations: tavilyResults?.citations?.length || 0,
          totalSources: combinedCitations.length
        }
      };
    } catch (error) {
      console.error("Dual search tool error:", error);
      dataStream?.writeData({
        type: 'tool-progress',
        content: { 
          step: 'error', 
          message: 'Search encountered an unexpected error'
        }
      });
      return {
        answer: "An unexpected error occurred during the search. Please try again later.",
        citations: []
      };
    }
  },
}); 