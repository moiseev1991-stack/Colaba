'use client';

import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface SearchFormProps {
  initialKeyword?: string;
  onSubmit?: (keyword: string) => void;
  showButton?: boolean;
}

function SearchForm({ 
  initialKeyword = '', 
  onSubmit,
  showButton = true 
}: SearchFormProps) {
  const [keyword, setKeyword] = useState(initialKeyword);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    onSubmit?.(keyword.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="flex gap-4 items-center">
        <Input
          type="text"
          placeholder="Введите ключевое слово..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="flex-1 max-w-4xl"
        />
        {showButton && (
          <Button type="submit" variant="default" disabled={!keyword.trim()}>
            Найти
          </Button>
        )}
      </div>
    </form>
  );
}

export default SearchForm;
export { SearchForm };
