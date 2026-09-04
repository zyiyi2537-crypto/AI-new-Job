declare global {
  interface HTMLWebViewElement {
    canGoBack(): boolean;
    canGoForward(): boolean;
    executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>;
    getURL(): string;
    goBack(): void;
    goForward(): void;
    loadURL(url: string): Promise<void>;
    reload(): void;
  }
}

export {};
