"use client";

import { Suspense } from "react";
import { useThemePreference } from "@/hooks/use-theme-preference";
import { AuthVisualPanel } from "../components/auth-visual-panel";
import { ThemeToggle } from "../components/theme-toggle";
import { LoginForm } from "./LoginForm";

export function LoginPageShell({ googleEnabled }: { googleEnabled: boolean }) {
  const { isDarkMode, setIsDarkMode } = useThemePreference();

  return (
    <Suspense fallback={null}>
      <div className={`min-h-screen font-sans relative overflow-hidden transition-colors ${isDarkMode ? "bg-black" : "bg-gray-100"}`}>
        <ThemeToggle isDarkMode={isDarkMode} onToggle={() => setIsDarkMode((prev) => !prev)} />

        <div className={`w-full lg:w-[52%] flex flex-col justify-center items-center px-5 sm:px-12 lg:px-16 xl:px-20 relative z-10 min-h-screen transition-colors ${isDarkMode ? "bg-black" : "bg-gray-100"}`}>
          <div className="max-w-[430px] w-full mx-auto lg:mx-0 py-16 sm:py-10 lg:py-0 lg:-mt-20 flex flex-col items-center">
            <div className="mb-8 sm:mb-12 text-left flex flex-col items-center">
              <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 leading-tight text-center ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Welcome to AkadVerse
              </h1>
              <p className={`text-sm sm:text-base ${isDarkMode ? "text-[#9CA3AF]" : "text-gray-600"}`}>
                Sign in to access your academic workspace.
              </p>
            </div>

            <LoginForm googleEnabled={googleEnabled} isDarkMode={isDarkMode} />
          </div>
        </div>

        <AuthVisualPanel isDarkMode={isDarkMode} />
      </div>
    </Suspense>
  );
}
