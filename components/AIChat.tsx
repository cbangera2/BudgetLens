"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAI } from '@/context/AIContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTransactions } from '@/hooks/useTransactions';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { MessageCircle, Send, Settings } from 'lucide-react';
import { AIConfig } from './AIConfig';

export function AIChat() {
  const [input, setInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const { messages, sendMessage, isLoading, error, config } = useAI();
  const { transactions } = useTransactions();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSendMessage = async () => {
    if (input.trim()) {
      const contextMessage = `
        Context: I have ${transactions.length} transactions. 
        Total transactions amount: $${transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
      `;

      await sendMessage(`${contextMessage}\n\n${input}`);
      setInput('');
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="fixed bottom-8 right-8 rounded-full w-16 h-16 shadow-lg bg-blue-500 text-white hover:bg-blue-600"
        >
          <MessageCircle className="w-8 h-8" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle>AI Financial Assistant</DialogTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowConfig(!showConfig)}
          >
            <Settings className="w-5 h-5" />
          </Button>
        </DialogHeader>

        {showConfig && <AIConfig />}

        <div className="flex-grow overflow-y-auto space-y-4 p-4 border rounded">
          {messages.map(message => (
            <div 
              key={message.id} 
              className={`p-3 rounded-lg max-w-[80%] ${
                message.role === 'user' 
                  ? 'bg-blue-100 self-end ml-auto' 
                  : 'bg-gray-100 self-start mr-auto'
              }`}
            >
              {message.content}
            </div>
          ))}
          {isLoading && (
            <div className="text-gray-500 italic">AI is thinking...</div>
          )}
          {error && (
            <div className="text-red-500">Error: {error}</div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="mt-4 flex space-x-2">
          <Input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Ask about your transactions..."
            className="flex-grow"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={isLoading}
            size="icon"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}