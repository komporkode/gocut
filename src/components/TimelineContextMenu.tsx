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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      // Ignore right-click down so contextmenu events can handle new positioning cleanly
      if (e.button === 2) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Adjust positioning to stay safely within viewport
  const estimatedHeight = items.length * 30 + 16;
  const adjustedX = Math.max(8, Math.min(x, window.innerWidth - 220));
  const adjustedY = Math.max(8, Math.min(y, window.innerHeight - estimatedHeight - 12));

  return (
    <div
      ref={menuRef}
      className="tl-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
      role="menu"
      onContextMenu={(e) => {
        // Prevent default browser context menu inside custom context menu
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={`div-${index}`} className="tl-context-divider" />;
        }
        return (
          <button
            key={`item-${index}-${item.label}`}
            className={`tl-context-item ${item.danger ? "is-danger" : ""}`}
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
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
