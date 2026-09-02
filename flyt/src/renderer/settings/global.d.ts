interface FlytNavigate {
  onNavigate(cb: (pane: string) => void): () => void;
}

interface Window {
  flytNavigate: FlytNavigate;
}
