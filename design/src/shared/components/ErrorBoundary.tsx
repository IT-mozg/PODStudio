import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render-time errors in whatever page is routed below it, so
 *  one broken page doesn't take the whole shell down with it — the
 *  sidebar/topbar stay usable and the user can navigate elsewhere.
 *  React only supports this via a class component; there's no hook
 *  equivalent. App.tsx keys this by the current route so navigating
 *  away from a broken page mounts a fresh boundary automatically. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in routed page:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.wrap}>
          <div className={styles.title}>Щось пішло не так</div>
          <div className={styles.detail}>{this.state.error.message}</div>
          <div className={styles.retry} onClick={() => this.setState({ error: null })}>
            Спробувати ще раз
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
