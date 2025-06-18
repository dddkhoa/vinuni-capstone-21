import OpenAI from 'openai';
import { tool, type DataStreamWriter } from 'ai';
import { z } from 'zod';
import {
  fileSearchPromptInstruction,
  vinUniTopicPrompt,
} from '@/lib/ai/prompts';
import { tavily } from '@tavily/core';
import type { Session } from 'next-auth';

// Constants and environment variables
const OPENAI_MODEL_KEYWORD_EXTRACTION = 'gpt-4o-mini';
const DEFAULT_ERROR_MESSAGE =
  'An unexpected error has occurred. Please refresh the page, delete this chat or try again later!';
const DENIED_MESSAGE =
  "I'm sorry, but I can only assist with questions related to VinUni-related topics. Please ask questions about admissions, scholarships, courses, faculty, research, campus life, or other university-related topics.";
const POLICY_DOMAIN = 'site:policy.vinuni.edu.vn';
const MAX_RESULTS_PER_DOMAIN = 5;
const MAX_GENERAL_RESULTS = 5; // More results for filtering

// Create OpenAI client for keyword extraction
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
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
          role: 'system',
          content: `You are a keyword extraction assistant. Extract the most important keywords from the user's query that would be useful for searching academic/university policy documents. Return ONLY a JSON array of keywords, maximum 5 keywords. Do not include common words like "what", "how", "where", "the", "a", "an", etc. Focus on nouns, proper nouns, and important terms.

Example:
User: "What are the requirements for the robotics minor?"
Response: ["robotics", "minor", "requirements"]

User: "How do I apply for financial aid?"
Response: ["financial aid", "application", "apply"]`,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.1,
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Failed to extract keywords');
    }

    try {
      const keywords = JSON.parse(content);
      if (Array.isArray(keywords)) {
        return keywords.filter(
          (k) => typeof k === 'string' && k.trim().length > 0,
        );
      }
    } catch {
      // Fallback: extract words manually if JSON parsing fails
      const words = content.toLowerCase().match(/\b\w+\b/g) || [];
      return words.filter((word) => word.length > 2).slice(0, 5);
    }

    return [];
  } catch (error) {
    console.error('Keyword extraction failed:', error);
    // Fallback: extract words from the original query
    const words = query.toLowerCase().match(/\b\w+\b/g) || [];
    return words
      .filter(
        (word) =>
          word.length > 2 &&
          ![
            'what',
            'how',
            'where',
            'when',
            'why',
            'the',
            'and',
            'for',
            'are',
            'can',
            'will',
            'do',
            'does',
          ].includes(word),
      )
      .slice(0, 5);
  }
}

/**
 * Check if a URL belongs to a VinUni domain (ends with .vinuni.edu.vn)
 */
function isVinUniDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname.endsWith('.vinuni.edu.vn') || hostname === 'vinuni.edu.vn';
  } catch {
    return false;
  }
}

/**
 * Build search query for Tavily
 */
function buildSearchQuery(keywords: string[], domain?: string): string {
  const quotedKeywords = keywords.map((keyword) => `"${keyword}"`).join(' ');
  return domain ? `${domain} ${quotedKeywords}` : quotedKeywords;
}

/**
 * Filter search results to only include VinUni domains
 */
function filterVinUniResults(results: any[]): any[] {
  return results.filter((result) => {
    if (!result.url) return false;
    return isVinUniDomain(result.url);
  });
}

/**
 * Perform Tavily search: policy domain + general search filtered to VinUni domains
 */
async function performDualDomainSearch(
  keywords: string,
  dataStream?: DataStreamWriter,
) {
  try {
    // Search policy domain
    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'search-policy',
        message: 'Searching policy.vinuni.edu.vn...',
      },
    });

    // const policyQuery = buildSearchQuery(keywords, POLICY_DOMAIN);
    const policyQuery = `site:policy.vinuni.edu.vn ${keywords}`;

    console.log('Policy query:', policyQuery);

    const policyResponse = await tavilyClient.search(policyQuery, {
      searchDepth: 'advanced',
      includeImages: false,
      includeAnswer: false,
      maxResults: MAX_RESULTS_PER_DOMAIN,
      includeRawContent: 'text',
    });

    // General search (naive Google search)
    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'search-general',
        message: 'Searching web for VinUni domains...',
      },
    });

    // const generalQuery = buildSearchQuery(keywords); // No domain restriction
    const generalQuery = keywords;

    console.log('General query:', generalQuery);
    const generalResponse = await tavilyClient.search(generalQuery, {
      searchDepth: 'advanced',
      includeImages: false,
      includeAnswer: false,
      maxResults: MAX_GENERAL_RESULTS, // Get more results for filtering
      includeRawContent: 'text',
    });

    // Filter general results to only VinUni domains
    const filteredGeneralResults = filterVinUniResults(
      generalResponse.results || [],
    );

    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'filter-results',
        message: `Filtered ${generalResponse.results?.length || 0} general results to ${filteredGeneralResults.length} VinUni domain results`,
      },
    });

    // Take top results from filtered general search
    const topGeneralResults = filteredGeneralResults.slice(
      0,
      MAX_RESULTS_PER_DOMAIN,
    );

    // Combine results
    const combinedResults = [
      ...(policyResponse.results || []),
      ...topGeneralResults,
    ];

    // Sort by score and take best results
    const sortedResults = combinedResults
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 6); // Maximum 6 results total

    return {
      results: sortedResults,
      policyCount: policyResponse.results?.length || 0,
      mainCount: topGeneralResults.length,
      totalCount: sortedResults.length,
      generalSearchTotal: generalResponse.results?.length || 0,
      filteredFromGeneral: filteredGeneralResults.length,
    };
  } catch (error) {
    console.error('Dual domain search failed:', error);
    throw error;
  }
}

/**
 * Check if query is VinUni-related using enhanced validation
 */
async function validateVinUniQuery(
  query: string,
): Promise<{ isValid: boolean; reason?: string }> {
  try {
    const prompt = `${vinUniTopicPrompt}

USER QUESTION: ${query}

Respond with only "VALID" if the question is related to VinUni or university topics as defined in the instructions, or "DENIED" if it's not related.`;

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_KEYWORD_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim();

    if (result === 'DENIED') {
      return {
        isValid: false,
        reason:
          "Your question doesn't appear to be related to VinUni or university topics. Please ask about admissions, courses, policies, campus life, or other university-related matters.",
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('Query validation failed:', error);
    // Default to allowing the query if validation fails
    return { isValid: true };
  }
}

/**
 * Generate answer using search results as context
 */
async function generateAnswerWithContext(query: string, searchResults: any[]) {
  try {
    // Build context from search results
    const context = searchResults
      .map(
        (result, index) =>
          `Document ${index + 1}:
Title: ${result.title}
URL: ${result.url}
Content: ${result.rawContent}
---`,
      )
      .join('\n\n');

    const prompt = `Based on the following documents from VinUni policy website, answer the user's question. ${fileSearchPromptInstruction}

DOCUMENTS:
${context}

USER QUESTION: ${query}

Please provide a comprehensive answer based solely on the information in the documents above.`;

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_KEYWORD_EXTRACTION,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const answer = response.choices[0]?.message?.content;
    if (!answer) {
      throw new Error('Failed to generate answer');
    }

    return answer;
  } catch (error) {
    console.error('Answer generation failed:', error);
    throw error;
  }
}

/**
 * Format search results as citations
 */
function formatCitations(searchResults: any[]) {
  return searchResults.map((result) => ({
    title: result.title,
    url: result.url,
    content: result.rawContent,
    score: result.score,
  }));
}

/**
 * Main function to fetch Tavily search results with enhanced flow
 */
export const fetchTavilyFileSearch = async ({
  query,
  dataStream,
}: {
  query: string;
  dataStream?: DataStreamWriter;
}) => {
  try {
    // Step 0: Validate if query is VinUni-related
    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'validate-query',
        message: 'Validating query relevance...',
      },
    });

    const validation = await validateVinUniQuery(query);
    if (!validation.isValid) {
      return {
        answer: validation.reason || DENIED_MESSAGE,
        citations: [],
        denied: true,
      };
    }

    // Step 1: Extract keywords from query
    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'extract-keywords',
        message: 'Extracting keywords from query...',
      },
    });

    // const keywords = await extractKeywords(query);

    // if (keywords.length === 0) {
    //   return {
    //     answer:
    //       "I couldn't extract meaningful keywords from your query. Please try rephrasing your question with more specific terms related to VinUni.",
    //     citations: [],
    //   };
    // }

    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'keywords-extracted',
        query,
        message: `Extracted keywords: ${query}`,
      },
    });

    // Step 2: Perform dual domain search
    const searchResponse = await performDualDomainSearch(query, dataStream);

    if (searchResponse.totalCount === 0) {
      return {
        answer:
          "I couldn't find any relevant information in the VinUni documents for your query. This could mean:\n\n1. The information might not be available in our indexed documents\n2. Try rephrasing your question with different keywords\n3. Your question might be too specific or too broad\n\nPlease try rephrasing your search query or ask about other VinUni-related topics such as admissions, courses, policies, or campus life.",
        citations: [],
        searchStats: {
          policyResults: searchResponse.policyCount,
          vinUniDomainResults: searchResponse.mainCount,
          totalResults: searchResponse.totalCount,
          generalSearchTotal: searchResponse.generalSearchTotal,
          filteredFromGeneral: searchResponse.filteredFromGeneral,
        },
      };
    }

    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'search-complete',
        resultsCount: searchResponse.totalCount,
        message: `Found ${searchResponse.totalCount} relevant documents (${searchResponse.policyCount} from policy site, ${searchResponse.mainCount} from VinUni domains)`,
      },
    });

    // Step 3: Generate answer using search results as context
    dataStream?.writeData({
      type: 'tool-progress',
      content: {
        step: 'generate-answer',
        message: 'Analyzing documents and generating answer...',
      },
    });

    const answer = await generateAnswerWithContext(
      query,
      searchResponse.results,
    );

    // Handle denial case
    if (answer === 'DENIED') {
      return {
        answer: DENIED_MESSAGE,
        citations: [],
        denied: true,
      };
    }

    // Handle not found case
    if (answer === 'NOT_FOUND') {
      return {
        answer:
          "I couldn't find specific information to answer your question in the available VinUni documents. Please try rephrasing your question or ask about other VinUni-related topics.",
        citations: formatCitations(searchResponse.results),
        searchStats: {
          policyResults: searchResponse.policyCount,
          vinUniDomainResults: searchResponse.mainCount,
          totalResults: searchResponse.totalCount,
          generalSearchTotal: searchResponse.generalSearchTotal,
          filteredFromGeneral: searchResponse.filteredFromGeneral,
        },
      };
    }

    // Step 4: Format citations
    const citations = formatCitations(searchResponse.results);

    return {
      answer,
      citations,
      searchQuery: query,
      keywords: query,
      searchStats: {
        policyResults: searchResponse.policyCount,
        vinUniDomainResults: searchResponse.mainCount,
        totalResults: searchResponse.totalCount,
        generalSearchTotal: searchResponse.generalSearchTotal,
        filteredFromGeneral: searchResponse.filteredFromGeneral,
      },
    };
  } catch (error) {
    console.error('Tavily file search error:', error);
    return {
      answer: DEFAULT_ERROR_MESSAGE,
      citations: [],
    };
  }
};

interface TavilyFileSearchProps {
  session: Session;
  dataStream: DataStreamWriter;
}

/**
 * AI tool definition for integration
 */
export const tavilyFileSearchTool = ({
  session,
  dataStream,
}: TavilyFileSearchProps) =>
  tool({
    description: `Search and retrieve answers from VinUni documents using Tavily search engine. This tool searches policy.vinuni.edu.vn and performs general web searches filtered to VinUni domains (*.vinuni.edu.vn) for comprehensive university-related information.`,
    parameters: z.object({
      query: z
        .string()
        .describe(
          'The search query to find relevant answers from VinUni policy documents.',
        ),
    }),
    execute: async ({ query }) => {
      try {
        if (!process.env.TAVILY_API_KEY) {
          console.error('Missing TAVILY_API_KEY environment variable');
          return "I'm unable to search VinUni policy documents at the moment. Please try again later.";
        }

        const results = await fetchTavilyFileSearch({ query, dataStream });
        return results;
      } catch (error) {
        console.error('Tavily file search tool error:', error);
        return 'I encountered an issue while searching for information. Please try again later.';
      }
    },
  });
