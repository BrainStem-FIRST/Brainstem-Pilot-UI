import React from 'react';
import { AlertTriangle, RotateCcw, Home, Copy, Check } from 'lucide-react';

/**
 * Catches render errors so one bad component doesn't take the whole app down.
 *
 * Without this, any exception thrown during render unmounts the entire tree — the screen goes
 * black with nothing written on it, no route to go back to, and nothing to report. That is a
 * bad failure mode anywhere, and a genuinely costly one at a competition, where the person
 * hitting it is a student who did not write the code and has minutes to spare.
 *
 * Nothing here tries to be clever about recovery. It keeps the app on screen, says what broke
 * in terms someone can pass on, and offers the two things that actually help: try this screen
 * again, or leave it for one that works. Your saved paths and autos are files on disk — a
 * render error never touched them — and it says so, because that is the first thing anyone
 * seeing a crash screen wants to know.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Still log it: the console is where a developer will look, and the details panel below
    // is deliberately short.
    console.error('[BrainSTEM Pilot] render error:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null, info: null, copied: false });

  goHome = () => {
    // A full navigation, not a router push — the router is inside the subtree that just died.
    window.location.href = import.meta.env.BASE_URL ?? '/';
  };

  copyDetails = async () => {
    const { error, info } = this.state;
    const text = [
      `BrainSTEM Pilot error: ${error?.message ?? error}`,
      `Page: ${window.location.pathname}`,
      error?.stack ?? '',
      info?.componentStack ?? '',
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      /* clipboard blocked — the details are on screen and in the console anyway */
    }
  };

  render() {
    const { error, info, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-amber-500/30 bg-card p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground">This screen stopped working</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your paths, points and autos are saved as files in your project folder and were
                not affected. Try this screen again, or go back to the home screen.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-secondary/40 border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              What went wrong
            </p>
            <p className="text-xs font-num text-foreground break-words">
              {error?.message ?? String(error)}
            </p>
            {info?.componentStack && (
              <p className="text-[11px] font-num text-muted-foreground mt-2 break-words">
                in {info.componentStack.trim().split('\n')[0].trim()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={this.reset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-all">
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
            <button onClick={this.goHome}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
              <Home className="w-4 h-4" /> Home screen
            </button>
            <button onClick={this.copyDetails}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all ml-auto">
              {copied ? <><Check className="w-4 h-4 text-green-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy details</>}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
