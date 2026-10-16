// src/app/checkout/_components/loadPaystackScript.ts
//
// Loads Paystack's inline popup script on demand (only when the buyer
// actually clicks "Proceed to Payment") and caches the loading promise so
// clicking twice doesn't inject the script twice. Client-only — this is
// purely the browser-side popup, no secret keys involved (see
// lib/external/paystack.ts for the server-side half).

export interface PaystackPopSetupOptions {
  key: string;
  email: string;
  amount: number;
  ref: string;
  currency?: string;
  onClose?: () => void;
  callback?: (response: { reference: string }) => void;
}

interface PaystackPopHandler {
  openIframe: () => void;
}

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: PaystackPopSetupOptions) => PaystackPopHandler;
    };
  }
}

const SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";

let loadPromise: Promise<void> | null = null;

export function loadPaystackScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser."));
  if (window.PaystackPop) return Promise.resolve();

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("Couldn't load the Paystack payment script."));
      };
      document.body.appendChild(script);
    });
  }

  return loadPromise;
}
