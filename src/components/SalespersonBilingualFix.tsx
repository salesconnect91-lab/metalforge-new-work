import { useEffect } from "react";

const PHRASES: Record<string, string> = {
  "New Salesperson": "New Salesperson / نیا سیلز پرسن",
  "Salesperson Name": "Salesperson Name / سیلز پرسن کا نام",
};

function applySalespersonLabels(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const raw = node.nodeValue ?? "";
    const trimmed = raw.trim();
    const replacement = PHRASES[trimmed];
    if (!replacement) continue;

    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    node.nodeValue = `${leading}${replacement}${trailing}`;
  }
}

export default function SalespersonBilingualFix() {
  useEffect(() => {
    applySalespersonLabels(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) applySalespersonLabels(node);
          else if (node.parentElement) applySalespersonLabels(node.parentElement);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
