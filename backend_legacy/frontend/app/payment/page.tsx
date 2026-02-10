'use client';

import { useState } from 'react';
import { CreditCard, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';

export default function PaymentPage() {
  const [email, setEmail] = useState('pochta@gmail.com');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [emailError, setEmailError] = useState('');

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (!value.trim()) {
      setEmailError('Заполните это поле');
    } else {
      setEmailError('');
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\s/g, '');
    if (value.length <= 16) {
      value = value.match(/.{1,4}/g)?.join(' ') || value;
      setCardNumber(value);
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 4) {
      if (value.length >= 2) {
        value = value.slice(0, 2) + '/' + value.slice(2);
      }
      setExpiry(value);
    }
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    setCvc(value);
  };

  const handlePay = () => {
    if (!email.trim()) {
      setEmailError('Заполните это поле');
      return;
    }
    // Mock payment processing
    alert('Оплата обрабатывается...');
  };

  return (
    <div className="max-w-[500px] mx-auto px-4 sm:px-6 overflow-x-hidden">
      <PageHeader breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Оплата' }]} title="Оплата" />
      <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gray-800 dark:bg-gray-700 rounded flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Оплата картой</h1>
        </div>

        {/* Email Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email для чека
          </label>
          <Input
            type="email"
            value={email}
            onChange={handleEmailChange}
            className={`w-full h-12 ${emailError ? 'border-red-500' : ''}`}
            placeholder="pochta@gmail.com"
          />
          {emailError && (
            <p className="text-red-500 text-sm mt-1">{emailError}</p>
          )}
        </div>

        {/* Yandex Pay Button */}
        <button
          onClick={handlePay}
          className="w-full bg-black hover:bg-gray-900 text-white rounded-[10px] p-4 mb-4 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-saas-primary rounded flex items-center justify-center">
              <span className="text-white font-bold text-lg">Я</span>
            </div>
            <span className="font-medium">Pay</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Оплатить</span>
            <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
          </div>
        </button>

        {/* SBP Button */}
        <button
          onClick={handlePay}
          className="w-full bg-[#6B46C1] hover:bg-[#5B21B6] text-white rounded-[10px] p-4 mb-6 flex items-center justify-between border-2 border-red-500 transition-colors"
        >
          <span className="font-medium">Оплатить</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
              <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
              <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
              <div className="w-3 h-3 bg-purple-500 rounded-sm"></div>
            </div>
            <span className="ml-2 text-sm font-medium">сбп</span>
          </div>
        </button>

        {/* Card Details */}
        <div className="space-y-4 mb-6">
          <Input
            type="text"
            value={cardNumber}
            onChange={handleCardNumberChange}
            placeholder="Номер карты"
            className="w-full h-12"
            maxLength={19}
          />
          
          <div className="flex gap-4">
            <Input
              type="text"
              value={expiry}
              onChange={handleExpiryChange}
              placeholder="MM/YY"
              className="w-full h-12"
              maxLength={5}
            />
            <div className="relative flex-1">
              <Input
                type="text"
                value={cvc}
                onChange={handleCvcChange}
                placeholder="CVC/CVV"
                className="w-full h-12 pr-10"
                maxLength={3}
              />
              <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Pay Button */}
        <Button
          onClick={handlePay}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-[10px] font-medium"
        >
          Оплатить
        </Button>

        {/* Disclaimer */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
          Нажимая кнопку «Оплатить», вы соглашаетесь с условиями использования сервиса
        </p>
      </div>
    </div>
  );
}
