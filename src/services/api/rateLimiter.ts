
import { AxiosResponse } from 'axios';
import axios from 'axios';

interface CacheItem {
  data: any;
  etag: string;
  timestamp: number;
}

class ApiRateLimiter {
  private static instance: ApiRateLimiter;
  private requestCount: number = 0;
  private resetTime: number = 0;
  private limit: number = 500000;
  private remaining: number = 500000;
  private cacheStorage: Map<string, CacheItem> = new Map();
  private CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes in milliseconds

  private constructor() {}

  public static getInstance(): ApiRateLimiter {
    if (!ApiRateLimiter.instance) {
      ApiRateLimiter.instance = new ApiRateLimiter();
    }
    return ApiRateLimiter.instance;
  }

  public async makeRequest<T>(
    url: string, 
    params: Record<string, any>, 
    apiKey: string
  ): Promise<T> {
    // Check if we've hit the rate limit
    if (this.remaining <= 0 && Date.now() < this.resetTime) {
      const waitTime = this.resetTime - Date.now();
      console.warn(`Rate limit reached. Reset in ${Math.ceil(waitTime / 1000)} seconds.`);
      throw new Error(`API rate limit reached. Please try again later.`);
    }

    // Generate cache key based on URL and params
    const cacheKey = `${url}?${new URLSearchParams(params).toString()}`;
    const cachedItem = this.cacheStorage.get(cacheKey);
    const config: any = { params };

    // If we have a cached response with an ETag, add If-None-Match header
    if (cachedItem && cachedItem.etag && (Date.now() - cachedItem.timestamp) < this.CACHE_EXPIRY) {
      config.headers = {
        'If-None-Match': cachedItem.etag
      };
    }

    try {
      const response = await axios.get(url, config);
      
      // Update rate limit info based on headers
      this.updateRateLimits(response);
      
      // Cache the response with ETag
      if (response.headers.etag) {
        this.cacheStorage.set(cacheKey, {
          data: response.data,
          etag: response.headers.etag,
          timestamp: Date.now()
        });
      }
      
      return response.data;
    } catch (error: any) {
      // If we get a 304 Not Modified, return the cached data
      if (error.response && error.response.status === 304 && cachedItem) {
        return cachedItem.data;
      }
      
      // Handle rate limiting error
      if (error.response && error.response.status === 429) {
        this.remaining = 0;
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      
      // Handle other errors
      console.error('API request failed:', error);
      throw error;
    }
  }

  public updateRateLimits(response: AxiosResponse): void {
    const headers = response.headers;
    
    // Extract rate limiting information from headers
    if (headers['x-ratelimit-requests-limit']) {
      this.limit = parseInt(headers['x-ratelimit-requests-limit']);
    }
    
    if (headers['x-ratelimit-requests-remaining']) {
      this.remaining = parseInt(headers['x-ratelimit-requests-remaining']);
    }
    
    if (headers['x-ratelimit-requests-reset']) {
      // Calculate reset time in milliseconds since epoch
      const resetSeconds = parseInt(headers['x-ratelimit-requests-reset']);
      this.resetTime = Date.now() + (resetSeconds * 1000);
    }
    
    // Log for debugging
    console.debug(`API Rate Limits - Limit: ${this.limit}, Remaining: ${this.remaining}`);
  }

  // Method to check if we're close to hitting the rate limit
  public isNearingRateLimit(safetyMargin: number = 50): boolean {
    return this.remaining <= safetyMargin;
  }

  // Get current rate limit information
  public getRateLimitInfo() {
    return {
      limit: this.limit,
      remaining: this.remaining,
      resetTime: this.resetTime
    };
  }
}

// Export the singleton instance
export const apiRateLimiter = ApiRateLimiter.getInstance();
