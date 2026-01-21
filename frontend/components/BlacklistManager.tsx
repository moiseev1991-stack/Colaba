'use client';

import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { FolderMinus, ChevronDown } from 'lucide-react';
import { getBlacklist, addToBlacklist, removeFromBlacklist } from '@/lib/storage';
import type { BlacklistItem } from '@/lib/types';

export function BlacklistManager() {
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [domain, setDomain] = useState('');

  useEffect(() => {
    // Инициализация: если blacklist пуст, добавляем 3 примера
    const currentBlacklist = getBlacklist();
    if (currentBlacklist.length === 0) {
      const exampleDomains = ['domain.com', 'example.com', 'test-site.ru'];
      exampleDomains.forEach(domain => {
        addToBlacklist(domain);
      });
      setBlacklist(getBlacklist());
    } else {
      setBlacklist(currentBlacklist);
    }
  }, []);

  const handleAdd = () => {
    if (!domain.trim()) return;
    addToBlacklist(domain);
    setBlacklist(getBlacklist());
    setDomain('');
  };

  const handleRemove = (itemDomain: string) => {
    removeFromBlacklist(itemDomain);
    setBlacklist(getBlacklist());
  };

  return (
    <div className="rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden bg-[#d2d4d7] dark:bg-[#1f2937]">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <FolderMinus className="h-5 w-5 text-blue-700 dark:text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Блэклист</h2>
        </div>
      </div>

      {/* Add Item Section */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Input
              type="text"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
              className="pr-10 bg-white dark:bg-gray-700"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
          <Button 
            onClick={handleAdd}
            className="bg-blue-700 hover:bg-blue-800 text-white"
          >
            Добавить
          </Button>
        </div>
      </div>

      {/* Blacklist Items */}
      <div className="px-6 py-4 bg-[#d2d4d7] dark:bg-[#1f2937]">
        {blacklist.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            Черный список пуст
          </p>
        ) : (
          <div className="space-y-3">
            {blacklist.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2"
              >
                <span className="text-gray-900 dark:text-white font-medium">
                  {item.domain}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemove(item.domain)}
                  className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
                >
                  Удалить
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
