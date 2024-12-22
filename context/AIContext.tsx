"use client";

import React, { createContext, useState, useContext, useCallback } from 'react';
import { AIMessage, AIContextType, AIConfig } from '@/lib/types';
import { OpenAI } from 'openai';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const AIContext = createContext<AIContextType>({
  messages: [],
  config: { provider: 'openai' },
  sendMessage: async () => {},
  setConfig: () => {},
  isLoading: false,
  error: null
});

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AIConfig>({
    provider: 'ollama',
    model: 'mistral',
    baseURL: 'http://localhost:11434'
  });

  const updateConfig = useCallback((newConfig: Partial<AIConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  const sendMessage = useCallback(async (userMessage: string) => {
    setIsLoading(true);
    setError(null);

    const newUserMessage: AIMessage = {
      id: Date.now().toString(),
      content: userMessage,
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);

    try {
      let assistantResponse: string | undefined;

      if (config.provider === 'openai') {
        const openai = new OpenAI({
          apiKey: config.apiKey,
          dangerouslyAllowBrowser: true
        });

        const completion = await openai.chat.completions.create({
          model: config.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system', 
              content: `You are a financial assistant analyzing transaction data. 
              Provide insights, answer questions, and help users understand their spending patterns.
              Always base your responses on the context of their transactions.`
            },
            ...messages.map(m => ({ 
              role: m.role, 
              content: m.content 
            })),
            { role: 'user', content: userMessage }
          ]
        });

        assistantResponse = completion.choices[0].message.content || undefined;
      } else if (config.provider === 'ollama') {
        const baseURL = config.baseURL || 'http://localhost:11434';
        const controller = new AbortController();
        const signal = controller.signal;

        // Prepare the request configuration
        const requestConfig = {
          method: 'post',
          url: `${baseURL}/api/chat`,
          data: {
            model: config.model || 'llama2',
            messages: [
              {
                role: 'system', 
                content: `You are a financial assistant analyzing transaction data. 
                Provide insights, answer questions, and help users understand their spending patterns.
                Always base your responses on the context of their transactions.`
              },
              ...messages.map(m => ({ 
                role: m.role, 
                content: m.content 
              })),
              { role: 'user', content: userMessage }
            ],
            stream: true
          },
          signal: signal,
          responseType: 'text'
        };

        // Create a promise to accumulate the full response
        const responsePromise = new Promise<{ content: string; stats: any }>((resolve, reject) => {
          let fullResponse = '';
          let partialResponse = '';
          let responseStats: any = {};

          const processChunk = (chunk: string) => {
            try {
              const lines = chunk.trim().split('\n');
              lines.forEach(line => {
                try {
                  const parsedLine = JSON.parse(line);
                  
                  // Handle streaming message content
                  if (parsedLine.message && parsedLine.message.content) {
                    partialResponse += parsedLine.message.content;
                    
                    // Update messages with streaming content
                    setMessages(prev => {
                      const existingMessageIndex = prev.findLastIndex(m => m.role === 'assistant');
                      
                      if (existingMessageIndex !== -1) {
                        const updatedMessages = [...prev];
                        updatedMessages[existingMessageIndex] = {
                          ...updatedMessages[existingMessageIndex],
                          content: partialResponse
                        };
                        return updatedMessages;
                      } else {
                        return [...prev, {
                          id: Date.now().toString(),
                          content: partialResponse,
                          role: 'assistant',
                          timestamp: new Date()
                        }];
                      }
                    });
                  }

                  // Capture response statistics when done
                  if (parsedLine.done === true) {
                    responseStats = {
                      total_duration: parsedLine.total_duration,
                      load_duration: parsedLine.load_duration,
                      prompt_eval_count: parsedLine.prompt_eval_count,
                      prompt_eval_duration: parsedLine.prompt_eval_duration,
                      eval_count: parsedLine.eval_count,
                      eval_duration: parsedLine.eval_duration
                    };
                    resolve({ content: partialResponse, stats: responseStats });
                  }
                } catch (parseError) {
                  console.warn('Error parsing Ollama response chunk:', parseError);
                }
              });
            } catch (chunkError) {
              console.error('Error processing Ollama response chunk:', chunkError);
              reject(chunkError);
            }
          };

          // Use fetch for more reliable streaming in browser
          fetch(requestConfig.url, {
            method: requestConfig.method,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestConfig.data),
            signal: requestConfig.signal
          }).then(async (response) => {
            if (!response.body) {
              throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                // If no partial response, reject
                if (!partialResponse) {
                  reject(new Error('No response received from Ollama'));
                }
                break;
              }

              // Decode and process the chunk
              const chunk = decoder.decode(value, { stream: true });
              processChunk(chunk);
            }
          }).catch(reject);
        });

        // Wait for the full response
        const { content: assistantResponse } = await responsePromise;

        // Ensure the final message is set
        if (assistantResponse) {
          setMessages(prev => {
            const existingMessageIndex = prev.findLastIndex(m => m.role === 'assistant');
            
            if (existingMessageIndex !== -1) {
              const updatedMessages = [...prev];
              updatedMessages[existingMessageIndex] = {
                ...updatedMessages[existingMessageIndex],
                content: assistantResponse
              };
              return updatedMessages;
            } else {
              return [...prev, {
                id: Date.now().toString(),
                content: assistantResponse,
                role: 'assistant',
                timestamp: new Date()
              }];
            }
          });
        }
      }

      if (assistantResponse) {
        const markdownContent = (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]} 
            rehypePlugins={[rehypeRaw]}
          >
            {assistantResponse}
          </ReactMarkdown>
        );

        const newAssistantMessage: AIMessage = {
          id: Date.now().toString(),
          content: assistantResponse,
          renderedContent: markdownContent,
          role: 'assistant',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, newAssistantMessage]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [messages, config]);

  return (
    <AIContext.Provider 
      value={{ 
        messages, 
        sendMessage, 
        isLoading, 
        error, 
        config,
        setConfig: updateConfig 
      }}
    >
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => useContext(AIContext);