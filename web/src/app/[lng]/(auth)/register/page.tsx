// app/[lng]/(unauthed)/register/page.tsx
'use client';

import { register } from "@/lib/actions/auth";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import NameInput from "@/components/ui/name-input";
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Register() {
  const [errors, setErrors] = useState<string[]>([]);
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
  const lng = params.lng as string;

  async function handleSubmit(formData: FormData) {
    setErrors([]);
    formData.append('language', lng);
    
    const result = await register(formData);
    
    if (result?.errors) {
      setErrors(result.errors.map(error => t(`auth.errors.${error}`)));
    } else if (result?.redirect) {
      // Store auth attempt state temporarily
      sessionStorage.setItem('auth_attempt', 'true');
      
      // Add a small delay to ensure auth state propagation
      await new Promise(resolve => setTimeout(resolve, 200));
      
      router.push(`/${lng}${result.redirect}`);
      
      // Clean up after navigation
      setTimeout(() => {
        sessionStorage.removeItem('auth_attempt');
      }, 1000);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <form action={handleSubmit} className="bg-base-100 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-8 text-center text-base-content">
          {t('auth.register')}
        </h1>
        
        {errors.length > 0 && (
          <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="font-medium">{t('auth.registrationFailed')}:</span>
            </div>
            <ul className="list-disc ml-5 space-y-1">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          <NameInput />
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-base-content/80 mb-1">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder={t('auth.emailPlaceholder')}
              required
              className="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-base-content/80 mb-1">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder={t('auth.passwordPlaceholder')}
              required
              className="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="passwordConfirm" className="block text-sm font-medium text-base-content/80 mb-1">
              {t('auth.confirmPassword')}
            </label>
            <input
              id="passwordConfirm"
              type="password"
              name="passwordConfirm"
              placeholder={t('auth.confirmPasswordPlaceholder')}
              required
              className="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full">
            {t('auth.register')}
          </button>
        </div>
      </form>
    </div>
  );
}