'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, SearchIcon, FileTextIcon, ExternalLinkIcon } from './icons';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface SearchResult {
  title: string;
  url: string;
  content?: string;
  score?: number;
}

interface SearchToolCallProps {
  args: {
    query: string;
  };
}

interface SearchToolResultProps {
  result: {
    answer?: string;
    citations?: SearchResult[];
    searchQuery?: string;
    keywords?: string[];
    searchStats?: {
      // Legacy Tavily search stats
      policyResults?: number;
      mainResults?: number;
      vinUniDomainResults?: number;
      totalResults?: number;
      // New Dual search stats
      fileSearchCompleted?: boolean;
      tavilySearchCompleted?: boolean;
      fileResultsFound?: boolean;
      tavilyResultsFound?: boolean;
      fileCitations?: number;
      tavilyCitations?: number;
      totalSources?: number;
      // Additional stats
      generalSearchTotal?: number;
      filteredFromGeneral?: number;
    };
    denied?: boolean;
  } | string;
}

export function SearchToolCall({ args }: SearchToolCallProps) {
  const [currentStep, setCurrentStep] = useState('file-search-start');
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [resultsCount, setResultsCount] = useState(0);
  const [searchStats, setSearchStats] = useState<{
    fileResultsFound?: boolean;
    tavilyResultsFound?: boolean; 
    fileCitations?: number;
    tavilyCitations?: number;
    totalSources?: number;
    // Legacy support
    policyResults?: number;
    mainResults?: number;
  }>({});

  // Support both dual search and legacy tavily search steps
  const dualSearchSteps = [
    { id: 'file-search-start', label: 'Searching internal file database', completed: false },
    { id: 'file-search-complete', label: 'File database search complete', completed: false },
    { id: 'tavily-search-start', label: 'Searching VinUni policy documents', completed: false },
    { id: 'validate-query', label: 'Validating query relevance', completed: false },
    { id: 'extract-keywords', label: 'Extracting keywords', completed: false },
    { id: 'keywords-extracted', label: 'Keywords extracted', completed: false },
    { id: 'search-policy', label: 'Searching policy.vinuni.edu.vn', completed: false },
    { id: 'search-general', label: 'Searching web for VinUni domains', completed: false },
    { id: 'filter-results', label: 'Filtering to VinUni domains', completed: false },
    { id: 'search-complete', label: 'Processing results', completed: false },
    { id: 'tavily-search-complete', label: 'VinUni documents search complete', completed: false },
    { id: 'combining-results', label: 'Combining search results', completed: false },
    { id: 'generate-answer', label: 'Generating answer', completed: false },
  ];

  const steps = dualSearchSteps;

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  return (
    <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
        <SearchIcon size={16} />
        <span>🔍 Dual Search Tool</span>
      </div>
      
      <div className="space-y-2">
        <div className="text-sm">
          <span className="font-medium">Query:</span>
          <div className="mt-1 p-2 bg-background rounded border font-mono text-sm">
            {args.query}
          </div>
        </div>
        <div className="text-xs text-blue-600 dark:text-blue-400">
          Searching file database first, then VinUni policy documents and web domains (*.vinuni.edu.vn)
        </div>
      </div>

      {/* Progress Steps */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Search Progress:</div>
        <div className="space-y-1">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              <div className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center text-xs",
                index < currentStepIndex ? "bg-green-500 text-white" :
                index === currentStepIndex ? "bg-blue-500 text-white animate-pulse" :
                "bg-muted text-muted-foreground"
              )}>
                {index < currentStepIndex ? "✓" : 
                 index === currentStepIndex ? (
                   <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                 ) : (index + 1)}
              </div>
              <span className={cn(
                index <= currentStepIndex ? "text-foreground" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Show extracted keywords if available */}
      {extractedKeywords.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium">Keywords extracted:</div>
          <div className="flex flex-wrap gap-1">
            {extractedKeywords.map((keyword, i) => (
              <span key={i} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded-md font-mono text-xs">
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Show search query if available */}
      {searchQuery && (
        <div className="space-y-1">
          <div className="text-xs font-medium">Search queries:</div>
          <div className="p-2 bg-background rounded border font-mono text-xs whitespace-pre-line">
            {searchQuery}
          </div>
        </div>
      )}

      {/* Show detailed results count if available */}
      {(searchStats.fileCitations || searchStats.tavilyCitations || searchStats.policyResults || searchStats.mainResults) && (
        <div className="text-xs space-y-1">
          <div className="text-green-600 dark:text-green-400 font-medium">
            Search Results Found:
          </div>
          <div className="ml-2 space-y-1">
            {/* New dual search format */}
            {(searchStats.fileCitations !== undefined || searchStats.tavilyCitations !== undefined) ? (
              <>
                <div>📁 File database: {searchStats.fileCitations || 0} documents</div>
                <div>📋 VinUni documents: {searchStats.tavilyCitations || 0} documents</div>
                <div className="font-medium">📊 Total: {searchStats.totalSources || (searchStats.fileCitations || 0) + (searchStats.tavilyCitations || 0)} sources</div>
              </>
            ) : (
              /* Legacy format */
              <>
                <div>📋 Policy site: {searchStats.policyResults || 0} documents</div>
                <div>🏫 VinUni domains: {searchStats.mainResults || 0} documents</div>
                <div className="font-medium">📊 Total: {(searchStats.policyResults || 0) + (searchStats.mainResults || 0)} documents</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchToolResult({ result }: SearchToolResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Handle string result (error case)
  if (typeof result === 'string') {
    return (
      <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
        <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
          <SearchIcon size={16} />
          <span>Dual Search Error</span>
        </div>
        <div className="mt-2 text-sm text-red-600 dark:text-red-300">
          {result}
        </div>
      </div>
    );
  }

  const { answer, citations = [], searchQuery, keywords = [], searchStats, denied } = result;

  // Handle denied queries
  if (denied) {
    return (
      <div className="border rounded-lg p-4 bg-orange-50 dark:bg-orange-950/20">
        <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
          <SearchIcon size={16} />
          <span>⚠️ Query Validation</span>
        </div>
        <div className="mt-2 text-sm text-orange-600 dark:text-orange-300">
          {answer}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
        <SearchIcon size={16} />
        <span>✅ Dual Search Results</span>
      </div>

      {/* Search Statistics */}
      {searchStats && (
        <div className="bg-white dark:bg-gray-800 rounded p-3 border">
          <div className="text-sm font-medium mb-2">Search Summary:</div>
          
          {/* New dual search format */}
          {(searchStats.fileCitations !== undefined || searchStats.tavilyCitations !== undefined) ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="text-center">
                  <div className="font-medium text-blue-600">📁 File Database</div>
                  <div>{searchStats.fileCitations || 0} docs</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-green-600">📋 VinUni Docs</div>
                  <div>{searchStats.tavilyCitations || 0} docs</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-purple-600">📊 Total</div>
                  <div>{searchStats.totalSources || 0} sources</div>
                </div>
              </div>
              
              {/* Additional filtering stats if available */}
              {searchStats.generalSearchTotal !== undefined && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  <div>🌐 General search found: {searchStats.generalSearchTotal} results</div>
                  <div>🔍 Filtered to VinUni domains: {searchStats.filteredFromGeneral || 0} results</div>
                </div>
              )}
            </div>
          ) : (
            /* Legacy format */
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="text-center">
                <div className="font-medium text-blue-600">📋 Policy Site</div>
                <div>{searchStats.policyResults || 0} docs</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-green-600">🏫 VinUni Domains</div>
                <div>{searchStats.mainResults || searchStats.vinUniDomainResults || 0} docs</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-purple-600">📊 Total</div>
                <div>{searchStats.totalResults || 0} docs</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Details */}
      {(keywords.length > 0 || searchQuery) && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            <span>Search details</span>
          </Button>
          
          {isExpanded && (
            <div className="space-y-2 pl-4 border-l-2 border-green-200 dark:border-green-800">
              {keywords.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium">Keywords extracted:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {keywords.map((keyword, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded-md font-mono">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {searchQuery && (
                <div className="text-xs">
                  <span className="font-medium">Search queries used:</span>
                  <div className="mt-1 p-2 bg-background rounded border font-mono whitespace-pre-line">
                    {searchQuery}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Combined Search Results:</div>
          <div className="prose prose-sm max-w-none dark:prose-invert bg-white dark:bg-gray-800 p-3 rounded border">
            {answer.split('\n').map((line, i) => (
              <p key={i} className="mb-2 last:mb-0">{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Sources ({citations.length} documents):</div>
          <div className="space-y-2">
            {citations.map((citation, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 p-3 rounded border">
                <div className="flex items-start gap-2">
                  <FileTextIcon size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{citation.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {citation.content ? citation.content.substring(0, 150) + '...' : 'No preview available'}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLinkIcon size={12} />
                        View Source
                      </a>
                      {citation.score && (
                        <span className="text-xs text-green-600">
                          Score: {citation.score.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 