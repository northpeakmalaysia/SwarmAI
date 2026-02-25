import { MessageSquare } from 'lucide-react';

/**
 * Empty state component
 */
export const EmptyState: React.FC<{ text: string; subtext?: string }> = ({ text, subtext }) => (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
        <h3 className="text-lg font-medium text-gray-400">{text}</h3>
        {subtext && <p className="mt-2 text-sm">{subtext}</p>}
    </div>
);
