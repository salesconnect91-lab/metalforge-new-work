import PurchaseDraftAddControls from "@/components/PurchaseDraftAddControls";

export default function OrderBookActionHub(){
  // Legacy DOM action consolidation stays disabled. This hub only mounts
  // native React purchase-draft actions that are tenant and draft scoped.
  return <PurchaseDraftAddControls/>;
}
