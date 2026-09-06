import { useEffect } from "react";

const PHRASES: Record<string, string> = {
  "New Salesperson": "New Salesperson / نیا سیلز پرسن",
  "Salesperson Name": "Salesperson Name / سیلز پرسن کا نام",
};

function applySalespersonUi(root: ParentNode) {
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
    if (replacement) {
      const leading = raw.match(/^\s*/)?.[0] ?? "";
      const trailing = raw.match(/\s*$/)?.[0] ?? "";
      node.nodeValue = `${leading}${replacement}${trailing}`;
    }

    if (trimmed === "Auto Urdu") {
      const button = node.parentElement?.closest("button");
      if (button) {
        button.classList.remove("btn-secondary");
        button.classList.add("btn-primary");
      }
    }
  }
}

export default function SalespersonBilingualFix() {
  useEffect(() => {
    applySalespersonUi(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) applySalespersonUi(node);
          else if (node.parentElement) applySalespersonUi(node.parentElement);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
