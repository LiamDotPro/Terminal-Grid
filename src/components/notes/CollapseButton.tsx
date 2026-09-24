interface CollapseButtonProps {
  /** Which way the panel folds away. */
  side: "left" | "right";
  label: string;
  onClick: () => void;
}

/** The chevron in a panel head that folds that panel into its rail. */
export function CollapseButton({ side, label, onClick }: CollapseButtonProps) {
  return (
    <button
      type="button"
      className="btn btn--icon panel-head__collapse"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
