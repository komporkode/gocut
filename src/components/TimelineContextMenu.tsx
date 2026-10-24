import { useEffect, useRef } from "react";
import "./TimelineContextMenu.css";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick: () => void;
}

export interface TimelineContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function TimelineContextMenu({
  x,
  y,
  items,
  onClose,
}: TimelineContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust positioning to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - (items.length * 32 + 20));

  return (
    <div
      ref={menuRef}
      className="tl-context-menu"
      style={{ left: Math.max(8, adjustedX), top: Math.max(8, adjustedY) }}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={`div-${index}`} className="tl-context-divider" />;
        }
        return (
          <button
            key={`item-${index}`}
            className={`tl-context-item ${item.danger ? "is-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            role="menuitem"
          >
            {item.icon && <span className="tl-context-icon">{item.icon}</span>}
            <span className="tl-context-label">{item.label}</span>
            {item.shortcut && (
              <span className="tl-context-shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
