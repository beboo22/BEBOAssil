import React, { useState } from 'react';
import { Key } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface AIKeyInputProps {
  onApiKeySubmit: (apiKey: string) => void;
}

const AIKeyInput: React.FC<AIKeyInputProps> = ({ onApiKeySubmit }) => {
  const [apiKey, setApiKey] = useState('');
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      // Store in localStorage for this session
      localStorage.setItem('gemini-api-key', apiKey.trim());
      onApiKeySubmit(apiKey.trim());
      toast.success('API key saved successfully!');
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          AI Configuration
        </CardTitle>
        <CardDescription>
          Enter your Gemini AI API key to enable trip planning features. Your key is stored locally and never shared.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="apiKey">Gemini AI API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button type="submit" className="w-full" disabled={!apiKey.trim()}>
            Save API Key
          </Button>
        </form>
        <div className="mt-4 text-sm text-muted-foreground">
          <p>Don't have an API key? Get one from:</p>
          <a 
            href="https://makersuite.google.com/app/apikey" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Google AI Studio
          </a>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIKeyInput;