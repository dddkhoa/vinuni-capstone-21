import OpenAI from "openai";
import { tool } from 'ai';
import { z } from 'zod';
import { fileSearchPromptInstruction } from '@/lib/ai/prompts';
import { google } from 'googleapis';
import type { ResponseOutputMessage, ResponseOutputText } from "openai/resources/responses/responses.mjs";

type ExtendedFileCitation = ResponseOutputText.FileCitation & {
  filename: string
}

// Constants and environment variables
const OPENAI_MODEL_SEARCH = "gpt-4o-mini";
const OPENAI_MODEL_FALLBACK = "gpt-4.1";
const DEFAULT_ERROR_MESSAGE = "An unexpected error has occurred. Please refresh the page, delete this chat or try again later!";
const DENIED_MESSAGE = "I'm sorry, but I can only assist with questions related to VinUni-related topics.";

// Create a singleton OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3
});

// Initialize Google Sheets client - lazy loaded
let sheetsClient: any = null;
let filenameToUrlMap: Map<string, string> | null = null;
let mapInitPromise: Promise<void> | null = null;

/**
 * Initialize the Google Sheets client once
 */
function getGoogleSheetsClient() {
  if (sheetsClient) return sheetsClient;

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || "{}");
    const auth = new google.auth.JWT(
      credentials.client_email,
      undefined,
      credentials.private_key,
      [process.env.GOOGLE_SPREADSHEET_ENDPOINT || ""]
    );

    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (error) {
    console.error("Failed to initialize Google Sheets client:", error);
    throw new Error("Failed to access file reference data");
  }
}

/** 
 * Initialize the filename→URL map with error handling
 * Uses promise caching to prevent multiple simultaneous initializations
 */
async function initFilenameMap() {
  // Return existing map if available
  if (filenameToUrlMap) return;

  // If initialization is already in progress, wait for it
  if (mapInitPromise) {
    await mapInitPromise;
    return;
  }

  // Start initialization and cache the promise
  mapInitPromise = (async () => {
    try {
      const sheets = getGoogleSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: process.env.GOOGLE_SPREADSHEET_RANGE,
      });

      const rows = res.data.values || [];
      const map = new Map<string, string>();

      // Skip header row and process data
      for (const [name, url] of rows.slice(1)) {
        if (name && url) {
          map.set((name as string).trim(), (url as string).trim());
        }
      }

      filenameToUrlMap = map;
    } catch (error) {
      console.error("Failed to initialize filename map:", error);
      // Create empty map as fallback
      filenameToUrlMap = new Map();
    }
  })();

  await mapInitPromise;
}

/** 
 * Lookup a single filename's URL with memoization
 */
const urlCache = new Map<string, string | null>();
async function getUrlFromFileName(filename: string): Promise<string | null> {
  if (!filename) return null;

  const trimmedName = filename.trim();

  // Check cache first
  if (urlCache.has(trimmedName)) {
    return urlCache.get(trimmedName) || null;
  }

  await initFilenameMap();
  const url = filenameToUrlMap?.get(trimmedName) || null;

  // Cache the result
  urlCache.set(trimmedName, url);
  return url;
}

/**
 * Extract unique filenames from annotations
 */
function extractUniqueFilenames(annotations: ExtendedFileCitation[]): string[] {
  const uniqueFilenames = new Set<string>();

  for (const ann of annotations || []) {
    if (ann.type === 'file_citation' && ann.filename) {
      uniqueFilenames.add(ann.filename.trim());
    }
  }

  return Array.from(uniqueFilenames).filter(name => name.length > 0);
}

/**
 * Add URLs to annotations based on filenames
 */
async function enrichAnnotationsWithUrls(annotations: { filename: string }[]) {
  if (!annotations.length) return [];

  // Get all URLs in parallel to minimize wait time
  const enrichedAnnotations = await Promise.all(
    annotations.map(async (annotation) => {
      const filename = annotation.filename.trim();
      const baseTitle = filename.replace(/\.[^/.]+$/, "");
      const url = await getUrlFromFileName(filename);

      return {
        title: baseTitle,
        url: url
      };
    })
  );

  return enrichedAnnotations;
}

/**
 * Extract web search citations from response
 */
function extractWebCitations(annotations: ResponseOutputText['annotations'] = []): Array<{ title: string; url: string }> {
  const distinctCitations = new Map<string, { title: string; url: string }>();

  for (const ann of annotations) {
    if (ann.type === 'url_citation' && ann.url) {
      if (!distinctCitations.has(ann.url)) {
        distinctCitations.set(ann.url, {
          title: ann.title || new URL(ann.url).hostname,
          url: ann.url
        });
      }
    }
  }

  return Array.from(distinctCitations.values());
}

/**
 * Extract text content from OpenAI response
 */
function extractTextFromResponse(response: any): string | null {
  const message = response.output.find(
    (item: any): item is ResponseOutputMessage =>
      item.type === 'message' &&
      item.status === 'completed' &&
      item.role === 'assistant'
  );

  if (!message?.content?.[0]?.text) {
    return null;
  }

  return message.content[0].text;
}

/**
 * Extract annotations from OpenAI response
 */
function extractAnnotationsFromResponse(response: any): any[] {
  const message = response.output.find(
    (item: any): item is ResponseOutputMessage =>
      item.type === 'message' &&
      item.status === 'completed' &&
      item.role === 'assistant'
  );

  if (!message?.content?.[0]?.annotations) {
    return [];
  }

  return message.content[0].annotations;
}

/**
 * Perform vector search against file database
 */
async function performVectorSearch(query: string, vectorStoreId: string) {
  try {
    const formattedQuery = `${query}\n\n${fileSearchPromptInstruction}`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL_SEARCH,
      input: formattedQuery,
      tools: [{
        type: "file_search",
        vector_store_ids: [vectorStoreId],
      }],
      tool_choice: "required",
      parallel_tool_calls: false
    });

    const textAnswer = extractTextFromResponse(response);
    const annotations = extractAnnotationsFromResponse(response);

    if (!textAnswer) {
      throw new Error("Failed to get a valid response from search");
    }

    return { textAnswer, annotations };
  } catch (error) {
    console.error("Vector search failed:", error);
    throw error;
  }
}

/**
 * Perform web search as fallback
 */
async function performWebSearch(query: string) {
  try {
    const formattedQuery = `${query}\n\n${fileSearchPromptInstruction}`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL_FALLBACK,
      input: formattedQuery,
      tools: [{ type: "web_search_preview" }],
      tool_choice: "required",
      parallel_tool_calls: false
    });

    const textAnswer = extractTextFromResponse(response);
    const annotations = extractAnnotationsFromResponse(response);

    if (!textAnswer) {
      throw new Error("Failed to get a valid response from web search");
    }

    return { textAnswer, annotations };
  } catch (error) {
    console.error("Web search failed:", error);
    throw error;
  }
}

/**
 * Main function to fetch file search results
 */
export const fetchFileSearch = async ({
  query,
  vectorStoreId
}: {
  query: string;
  vectorStoreId: string
}) => {
  try {
    // First attempt - vector search
    const { textAnswer, annotations } = await performVectorSearch(query, vectorStoreId);

    // Handle denial case
    if (textAnswer === "DENIED") {
      return {
        answer: DENIED_MESSAGE,
        citations: []
      };
    }

    // Handle not found case - fallback to web search
    if (textAnswer === "NOT_FOUND") {
      const { textAnswer: webAnswer, annotations: webAnnotations } = await performWebSearch(query);
      const webCitations = extractWebCitations(webAnnotations);

      return {
        answer: webAnswer,
        citations: webCitations
      };
    }

    // Extract file citations and enrich with URLs
    const filenames = extractUniqueFilenames(annotations as ExtendedFileCitation[])
      .map(filename => ({ filename }));

    const enrichedCitations = await enrichAnnotationsWithUrls(filenames);

    return {
      answer: textAnswer,
      citations: enrichedCitations
    };
  } catch (error) {
    console.error("File search error:", error);
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
export const fileSearchTool = tool({
  description: `Search and retrieve answers from files based on user queries using vector search.`,
  parameters: z.object({
    query: z.string().describe('The search query to find relevant answers from files.')
  }),
  execute: async ({ query }) => {
    try {
      const vectorStoreId = process.env.VECTOR_STORE_ID;

      if (!vectorStoreId) {
        console.error("Missing VECTOR_STORE_ID environment variable");
        return "I'm unable to search files at the moment. Please try again later.";
      }

      const results = await fetchFileSearch({ query, vectorStoreId });
      return results;
    } catch (error) {
      console.error("File search tool error:", error);
      return "I encountered an issue while searching for information. Please try again later.";
    }
  },
});


