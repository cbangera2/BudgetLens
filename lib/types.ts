export interface Transaction {
  date: string;
  vendor: string;
  amount: number;
  category: string;
  transactionType: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
  percentage: number;
}

export interface MonthlySpending {
  month: string;
  total: number;
}

export type MetricType = 'expenses' | 'income' | 'savings';

export interface AIMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
}

export type AIProvider = 'openai' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export interface AIContextType {
  messages: AIMessage[];
  config: AIConfig;
  sendMessage: (message: string) => Promise<void>;
  setConfig: (config: Partial<AIConfig>) => void;
  isLoading: boolean;
  error: string | null;
}