"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAI } from '@/context/AIContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

export function AIConfig() {
  const { config, setConfig } = useAI();
  const [localConfig, setLocalConfig] = useState({
    ...config,
    provider: 'ollama'
  });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOllamaModels = async () => {
      try {
        setIsLoadingModels(true);
        const response = await axios.get(
          `${localConfig.baseURL || 'http://localhost:11434'}/api/tags`
        );
        
        console.log('Raw Ollama models response:', response.data);
        
        // Ensure we get full model names and trim any whitespace
        const models = response.data?.models
          ?.map((model: any) => model.name.trim())
          .filter((model: string) => model) || [];
        
        console.log('Processed models:', models);
        
        setOllamaModels(models);
        
        // If no model is set or the current model is not in the list, set the first model
        if (models.length > 0 && (!localConfig.model || !models.includes(localConfig.model))) {
          setLocalConfig(prev => ({ 
            ...prev, 
            model: models[0] 
          }));
        }
      } catch (error) {
        console.error('Error fetching Ollama models:', error);
        setModelError('Could not fetch Ollama models');
        setOllamaModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchOllamaModels();
  }, [localConfig.baseURL]);

  const handleSave = () => {
    // Ensure the selected model is from the fetched list
    const sanitizedConfig = {
      ...localConfig,
      model: ollamaModels.includes(localConfig.model) 
        ? localConfig.model 
        : (ollamaModels[0] || '')
    };
    setConfig(sanitizedConfig);
  };

  return (
    <div className="space-y-4 p-4 border rounded">
      <h3 className="text-lg font-semibold">AI Configuration</h3>
      
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="enable-openai"
          checked={localConfig.provider === 'openai'}
          onCheckedChange={(checked) => 
            setLocalConfig(prev => ({ 
              ...prev, 
              provider: checked ? 'openai' : 'ollama' 
            }))
          }
        />
        <label 
          htmlFor="enable-openai" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Enable OpenAI
        </label>
      </div>

      {/* OpenAI Configuration */}
      <div className={`space-y-2 ${localConfig.provider !== 'openai' ? 'opacity-50' : ''}`}>
        <label className="block mb-2">OpenAI Configuration</label>
        <Input 
          type="password"
          value={localConfig.apiKey || ''}
          onChange={(e) => 
            setLocalConfig(prev => ({ ...prev, apiKey: e.target.value }))
          }
          placeholder="Enter OpenAI API Key"
          disabled={localConfig.provider !== 'openai'}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox 
          id="enable-ollama"
          checked={localConfig.provider === 'ollama'}
          onCheckedChange={(checked) => 
            setLocalConfig(prev => ({ 
              ...prev, 
              provider: checked ? 'ollama' : 'openai' 
            }))
          }
        />
        <label 
          htmlFor="enable-ollama" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Enable Ollama
        </label>
      </div>

      {/* Ollama Configuration */}
      <div className={`space-y-2 ${localConfig.provider !== 'ollama' ? 'opacity-50' : ''}`}>
        <label className="block mb-2">Ollama Configuration</label>
        
        <div className="space-y-2">
          <Input 
            value={localConfig.baseURL || 'http://localhost:11434'}
            onChange={(e) => 
              setLocalConfig(prev => ({ ...prev, baseURL: e.target.value }))
            }
            placeholder="Ollama API Base URL"
            disabled={localConfig.provider !== 'ollama'}
          />

          <Select
            value={localConfig.model || ''}
            onValueChange={(value) => {
                console.log('Selected model:', value);
                console.log('Current models:', ollamaModels);
                console.log('Is model in list:', ollamaModels.includes(value));
               
              setLocalConfig(prev => ({ ...prev, model: value }))
            }}
            disabled={localConfig.provider !== 'ollama' || isLoadingModels}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Ollama Model">
                {localConfig.model || 'Select a model'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {isLoadingModels ? (
                <SelectItem value="" disabled>Loading models...</SelectItem>
              ) : ollamaModels.length === 0 ? (
                <SelectItem value="" disabled>No models found</SelectItem>
              ) : (
                ollamaModels.map((model) => (
                  <SelectItem 
                    key={model} 
                    value={model}
                    className="cursor-pointer hover:bg-gray-100"
                  >
                    {model}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button 
        onClick={handleSave} 
        disabled={
          (localConfig.provider === 'openai' && !localConfig.apiKey) || 
          (localConfig.provider === 'ollama' && (!localConfig.model || isLoadingModels))
        }
      >
        Save Configuration
      </Button>
    </div>
  );
}