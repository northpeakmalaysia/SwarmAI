import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * API Error response structure
 */
export interface ApiError {
  error: string;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Get API base URL from environment or use default
 * In production, use VITE_API_URL; in development, use /api (proxied by Vite)
 */
const getBaseURL = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    // Production: use full URL with /api path
    return `${apiUrl}/api`;
  }
  // Development: use relative /api path (proxied by Vite)
  return '/api';
};

const API_BASE_URL = getBaseURL();

/**
 * Enhanced API Service class
 * Provides type-safe HTTP methods with automatic auth token injection and error handling
 */
class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupRequestInterceptor();
    this.setupResponseInterceptor();
  }

  /**
   * Setup request interceptor to inject auth token
   */
  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const storedAuth = localStorage.getItem('swarm-auth');
        if (storedAuth) {
          try {
            const parsed = JSON.parse(storedAuth);
            const token = parsed.state?.token;
            if (token && config.headers) {
              config.headers.Authorization = `Bearer ${token}`;
            }
          } catch {
            // Invalid token format, ignore
          }
        }
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );
  }

  /**
   * Setup response interceptor to handle 401 errors
   */
  private setupResponseInterceptor(): void {
    this.client.interceptors.response.use(
      (response) => {
        // Return the full axios response for backward compatibility
        return response;
      },
      (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401) {
          // Clear auth state and redirect to login
          localStorage.removeItem('swarm-auth');
          window.location.href = '/login';
        }

        // Transform error to a consistent format
        const apiError: ApiError = error.response?.data ?? {
          error: 'Network error',
          message: error.message || 'An unexpected error occurred',
        };

        return Promise.reject(apiError);
      }
    );
  }

  /**
   * GET request - returns data directly
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get(url, config);
    return response.data as T;
  }

  /**
   * POST request - returns data directly
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post(url, data, config);
    return response.data as T;
  }

  /**
   * PUT request - returns data directly
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put(url, data, config);
    return response.data as T;
  }

  /**
   * PATCH request - returns data directly
   */
  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch(url, data, config);
    return response.data as T;
  }

  /**
   * DELETE request - returns data directly
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete(url, config);
    return response.data as T;
  }

  /**
   * Upload file(s) using multipart/form-data - returns data directly
   */
  async upload<T>(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    const response = await this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data as T;
  }

  /**
   * Set a default header for all requests
   */
  setHeader(key: string, value: string): void {
    this.client.defaults.headers.common[key] = value;
  }

  /**
   * Remove a default header
   */
  removeHeader(key: string): void {
    delete this.client.defaults.headers.common[key];
  }

  /**
   * Get the underlying axios instance (for advanced use cases)
   */
  getClient(): AxiosInstance {
    return this.client;
  }
}

// Export singleton instance
export const api = new ApiService();

// Also export as default for backward compatibility
export default api.getClient();
