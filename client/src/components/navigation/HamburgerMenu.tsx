import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { motion } from "framer-motion";

interface HamburgerMenuProps {
  onClick: () => void;
  isOpen?: boolean;
  className?: string;
}

export function HamburgerMenu({ onClick, isOpen = false, className = "" }: HamburgerMenuProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={`h-10 w-10 hover:bg-gradient-to-br hover:from-purple-50 hover:to-blue-50 dark:hover:from-purple-900/20 dark:hover:to-blue-900/20 transition-all duration-200 ${className}`}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        <motion.div
          initial={false}
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </motion.div>
      </Button>
    </motion.div>
  );
}
