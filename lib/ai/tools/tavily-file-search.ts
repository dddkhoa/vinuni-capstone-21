import OpenAI from "openai";
import { tool } from 'ai';
import { z } from 'zod';
import { fileSearchPromptInstruction } from '@/lib/ai/prompts';
import { tavily, TavilySearchOptions } from '@tavily/core';

// Constants and environment variables
const OPENAI_MODEL_KEYWORD_EXTRACTION = "gpt-4o-mini";
const DEFAULT_ERROR_MESSAGE = "An unexpected error has occurred. Please refresh the page, delete this chat or try again later!";
const DENIED_MESSAGE = "I'm sorry, but I can only assist with questions related to VinUni-related topics.";
const SITE_DOMAIN = "site:policy.vinuni.edu.vn/";
const MAX_RESULTS = 5;

// Create OpenAI client for keyword extraction
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3
});

// Create Tavily client
const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});

/**
 * Extract keywords from user query using GPT-4o-mini
 */
async function extractKeywords(query: string): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_KEYWORD_EXTRACTION,
      messages: [
        {
          role: "system",
          content: `You are a keyword extraction assistant. Extract the most important keywords from the user's query that would be useful for searching academic/university policy documents. Return ONLY a JSON array of keywords, maximum 5 keywords. Do not include common words like "what", "how", "where", "the", "a", "an", etc. Focus on nouns, proper nouns, and important terms.

Example:
User: "What are the requirements for the robotics minor?"
Response: ["robotics", "minor", "requirements"]

User: "How do I apply for financial aid?"
Response: ["financial aid", "application", "apply"]`
        },
        {
          role: "user", 
          content: query
        }
      ],
      temperature: 0.1,
      max_tokens: 100
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Failed to extract keywords");
    }

    try {
      const keywords = JSON.parse(content);
      if (Array.isArray(keywords)) {
        return keywords.filter(k => typeof k === 'string' && k.trim().length > 0);
      }
    } catch {
      // Fallback: extract words manually if JSON parsing fails
      const words = content.toLowerCase().match(/\b\w+\b/g) || [];
      return words.filter(word => word.length > 2).slice(0, 5);
    }

    return [];
  } catch (error) {
    console.error("Keyword extraction failed:", error);
    // Fallback: extract words from the original query
    const words = query.toLowerCase().match(/\b\w+\b/g) || [];
    return words.filter(word => word.length > 2 && !['what', 'how', 'where', 'when', 'why', 'the', 'and', 'for', 'are', 'can', 'will', 'do', 'does'].includes(word)).slice(0, 5);
  }
}

/**
 * Build search query for Tavily
 */
function buildSearchQuery(keywords: string[]): string {
  const quotedKeywords = keywords.map(keyword => `"${keyword}"`).join(' ');
  return `${SITE_DOMAIN} ${quotedKeywords}`;
}

/**
 * Perform Tavily search
 */
async function performTavilySearch(searchQuery: string) {
  try {
    const response = await tavilyClient.search(searchQuery, {
      searchDepth: "basic",
      includeImages: false,
      includeAnswer: false,
      maxResults: MAX_RESULTS,
    });

    return response;
  } catch (error) {
    console.error("Tavily search failed:", error);
    throw error;
  }
}

/**
 * Generate answer using search results as context
 */
async function generateAnswerWithContext(query: string, searchResults: any[]) {
  try {
    // Build context from search results
    const context = searchResults.map((result, index) => 
      `Document ${index + 1}:
Title: ${result.title}
URL: ${result.url}
Content: ${result.content}
---`
    ).join('\n\n');

    const prompt = `Based on the following documents from VinUni policy website, answer the user's question. ${fileSearchPromptInstruction}

DOCUMENTS:
${context}

USER QUESTION: ${query}

Please provide a comprehensive answer based solely on the information in the documents above.`;

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_KEYWORD_EXTRACTION,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    });

    const answer = response.choices[0]?.message?.content;
    if (!answer) {
      throw new Error("Failed to generate answer");
    }

    return answer;
  } catch (error) {
    console.error("Answer generation failed:", error);
    throw error;
  }
}

/**
 * Format search results as citations
 */
function formatCitations(searchResults: any[]) {
  return searchResults.map(result => ({
    title: result.title,
    url: result.url,
    content: result.content,
    score: result.score
  }));
}

/**
 * Main function to fetch Tavily search results
 */
export const fetchTavilyFileSearch = async ({
  query,
}: {
  query: string;
}) => {
  try {
    // Step 1: Extract keywords from query
    const keywords = await extractKeywords(query);
    
    if (keywords.length === 0) {
      return {
        answer: "I couldn't extract meaningful keywords from your query. Please try rephrasing your question.",
        citations: []
      };
    }

    // Step 2: Build search query
    const searchQuery = buildSearchQuery(keywords);
    
    // Step 3: Perform Tavily search
    const searchResponse = await performTavilySearch(searchQuery);
    
    if (!searchResponse.results || searchResponse.results.length === 0) {
      return {
        answer: "I couldn't find any relevant information in the VinUni policy documents for your query. Please try rephrasing your question or check if your question is related to VinUni policies.",
        citations: []
      };
    }

    // Step 4: Generate answer using search results as context
    const answer = await generateAnswerWithContext(query, searchResponse.results);
    
    // Handle denial case
    if (answer === "DENIED") {
      return {
        answer: DENIED_MESSAGE,
        citations: []
      };
    }

    // Handle not found case
    if (answer === "NOT_FOUND") {
      return {
        answer: "I couldn't find specific information to answer your question in the VinUni policy documents.",
        citations: formatCitations(searchResponse.results)
      };
    }

    // Step 5: Format citations
    const citations = formatCitations(searchResponse.results);

    return {
      answer,
      citations,
      searchQuery, // Include for debugging/transparency
      keywords // Include for debugging/transparency
    };
  } catch (error) {
    console.error("Tavily file search error:", error);
    // Return graceful error response
    return {
      answer: DEFAULT_ERROR_MESSAGE,
      citations: []
    };
  }
};

/**
 * AI tool definition for integration
 */
export const tavilyFileSearchTool = tool({
  description: `Search and retrieve answers from VinUni policy documents using Tavily search engine. This tool searches specifically within policy.vinuni.edu.vn for university-related information.`,
  parameters: z.object({
    query: z.string().describe('The search query to find relevant answers from VinUni policy documents.')
  }),
  execute: async ({ query }) => {
    try {
      if (!process.env.TAVILY_API_KEY) {
        console.error("Missing TAVILY_API_KEY environment variable");
        return "I'm unable to search VinUni policy documents at the moment. Please try again later.";
      }

      const results = await fetchTavilyFileSearch({ query });
      return results;
    } catch (error) {
      console.error("Tavily file search tool error:", error);
      return "I encountered an issue while searching for information. Please try again later.";
    }
  },
}); 