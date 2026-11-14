interface CrazyGamesSDK {
  init: () => Promise<void>;
  environment?: string;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
  };
  data: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear: () => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: CrazyGamesSDK;
    };
  }
}

class CrazyGamesBridge {
  private initialized = false;
  private initPromise: Promise<boolean> | null = null;
  private gameplayActive = false;
  private loadingStarted = false;

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.CrazyGames?.SDK);
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  private waitForSdkScript(): Promise<CrazyGamesSDK | undefined> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.resolve(undefined);
    }
    if (window.CrazyGames?.SDK) {
      return Promise.resolve(window.CrazyGames.SDK);
    }
    const script = document.getElementById('crazygames-sdk-script') as HTMLScriptElement | null;
    if (!script) {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        script.removeEventListener('load', finish);
        script.removeEventListener('error', finish);
        window.clearTimeout(timer);
        resolve(window.CrazyGames?.SDK);
      };
      const timer = window.setTimeout(finish, 1500);
      script.addEventListener('load', finish);
      script.addEventListener('error', finish);
    });
  }

  public async init(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const sdk = await this.waitForSdkScript();
      if (!sdk || sdk.environment === 'disabled') {
        return false;
      }

      try {
        await sdk.init();
        if (sdk.environment === 'disabled') {
          this.initialized = false;
          return false;
        }

        this.initialized = true;
        if (!this.loadingStarted) {
          this.loadingStarted = true;
          sdk.game?.loadingStart?.();
          sdk.game?.loadingStop?.();
        }
        return true;
      } catch {
        this.initialized = false;
        return false;
      }
    })();

    return this.initPromise;
  }

  public gameplayStart(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    if (!this.initialized) return;
    try {
      window.CrazyGames?.SDK?.game?.gameplayStart?.();
    } catch {
      // Fail silently outside CrazyGames environment
    }
  }

  public gameplayStop(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    if (!this.initialized) return;
    try {
      window.CrazyGames?.SDK?.game?.gameplayStop?.();
    } catch {
      // Fail silently
    }
  }

  public happytime(): void {
    if (!this.initialized) return;
    try {
      window.CrazyGames?.SDK?.game?.happytime?.();
    } catch {
      // Fail silently
    }
  }

  public dataGetItem(key: string): string | null {
    if (!this.initialized) return null;
    try {
      return window.CrazyGames?.SDK?.data?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  }

  public dataSetItem(key: string, value: string): boolean {
    if (!this.initialized) return false;
    try {
      window.CrazyGames?.SDK?.data?.setItem?.(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export const crazyGames = new CrazyGamesBridge();
