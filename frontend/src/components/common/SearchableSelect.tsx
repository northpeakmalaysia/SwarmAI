import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, ChevronDown, Loader2, X, Check, User } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Secondary text (e.g., email, phone) */
  sublabel?: string;
  /** Avatar URL */
  avatar?: string;
  /** Additional metadata for filtering */
  metadata?: Record<string, unknown>;
  /** Whether option is disabled */
  disabled?: boolean;
}

export interface SearchableSelectProps {
  /** Currently selected value (option id) */
  value: string | null;
  /** Callback when selection changes */
  onChange: (value: string | null, option?: SelectOption) => void;
  /** Static options (use this OR fetchOptions, not both) */
  options?: SelectOption[];
  /** Async function to fetch options (for server-side search) */
  fetchOptions?: (query: string) => Promise<SelectOption[]>;
  /** Debounce delay for async search (ms) */
  debounceMs?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Whether select is disabled */
  disabled?: boolean;
  /** Whether select is loading */
  loading?: boolean;
  /** Whether to allow clearing selection */
  clearable?: boolean;
  /** Whether to show avatars */
  showAvatars?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Additional className */
  className?: string;
  /** Required field indicator */
  required?: boolean;
  /** Filter function for static options */
  filterFn?: (option: SelectOption, query: string) => boolean;
}

/**
 * SearchableSelect - A generic searchable dropdown component
 *
 * Features:
 * - Works with static options or async fetch
 * - Debounced search
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Avatar support
 * - Clearable selection
 * - Loading states
 *
 * @example Static options:
 * ```tsx
 * <SearchableSelect
 *   value={selectedId}
 *   onChange={(id) => setSelectedId(id)}
 *   options={[
 *     { id: '1', label: 'Option 1' },
 *     { id: '2', label: 'Option 2', sublabel: 'Extra info' },
 *   ]}
 *   placeholder="Select an option..."
 * />
 * ```
 *
 * @example Async fetch:
 * ```tsx
 * <SearchableSelect
 *   value={selectedId}
 *   onChange={(id, option) => handleSelect(id, option)}
 *   fetchOptions={async (query) => {
 *     const response = await api.get(`/contacts?search=${query}`);
 *     return response.data.map(c => ({ id: c.id, label: c.name }));
 *   }}
 *   placeholder="Search contacts..."
 * />
 * ```
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options: staticOptions,
  fetchOptions,
  debounceMs = 300,
  placeholder = 'Select...',
  label,
  error,
  helperText,
  disabled = false,
  loading: externalLoading = false,
  clearable = true,
  showAvatars = false,
  emptyMessage = 'No options found',
  className,
  required = false,
  filterFn,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [options, setOptions] = useState<SelectOption[]>(staticOptions || []);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default filter function
  const defaultFilter = useCallback((option: SelectOption, query: string) => {
    const q = query.toLowerCase();
    return (
      option.label.toLowerCase().includes(q) ||
      (option.sublabel?.toLowerCase().includes(q) ?? false)
    );
  }, []);

  // Get selected option
  const selectedOption = useMemo(() => {
    if (!value) return null;
    // Check current options
    const found = options.find(o => o.id === value);
    if (found) return found;
    // Check static options if different
    if (staticOptions) {
      return staticOptions.find(o => o.id === value) || null;
    }
    return null;
  }, [value, options, staticOptions]);

  // Filter static options based on search
  const filteredOptions = useMemo(() => {
    if (fetchOptions) {
      // Async mode - options are already filtered by server
      return options;
    }

    if (!searchQuery.trim()) {
      return staticOptions || [];
    }

    const filter = filterFn || defaultFilter;
    return (staticOptions || []).filter(opt => filter(opt, searchQuery));
  }, [staticOptions, searchQuery, fetchOptions, options, filterFn, defaultFilter]);

  // Fetch options (async mode)
  const doFetch = useCallback(async (query: string) => {
    if (!fetchOptions) return;

    setIsLoading(true);
    try {
      const result = await fetchOptions(query);
      setOptions(result);
    } catch (err) {
      console.error('SearchableSelect fetch error:', err);
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOptions]);

  // Debounced fetch for async mode
  useEffect(() => {
    if (!isOpen || !fetchOptions) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      doFetch(searchQuery);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, isOpen, doFetch, debounceMs, fetchOptions]);

  // Initial fetch when opened (async mode)
  useEffect(() => {
    if (isOpen && fetchOptions && options.length === 0) {
      doFetch('');
    }
  }, [isOpen, fetchOptions, doFetch, options.length]);

  // Update options when staticOptions change
  useEffect(() => {
    if (staticOptions) {
      setOptions(staticOptions);
    }
  }, [staticOptions]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset highlight when options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const opts = fetchOptions ? options : filteredOptions;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, opts.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (opts[highlightedIndex] && !opts[highlightedIndex].disabled) {
          handleSelect(opts[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (option: SelectOption) => {
    onChange(option.id, option);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setSearchQuery('');
  };

  const displayOptions = fetchOptions ? options : filteredOptions;
  const showLoading = isLoading || externalLoading;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border transition-colors',
          'bg-slate-800/50 text-left',
          isOpen
            ? 'border-sky-500 ring-2 ring-sky-500/20'
            : 'border-slate-600 hover:border-slate-500',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-red-500'
        )}
      >
        <span className="flex items-center gap-2 flex-1 min-w-0">
          {showAvatars && selectedOption && (
            selectedOption.avatar ? (
              <img
                src={selectedOption.avatar}
                alt=""
                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 text-gray-400" />
              </div>
            )
          )}
          <span className={cn(
            'truncate',
            selectedOption ? 'text-white' : 'text-gray-500'
          )}>
            {selectedOption?.label || placeholder}
          </span>
        </span>

        <div className="flex items-center gap-1 flex-shrink-0">
          {showLoading && (
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
          )}
          {clearable && selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-slate-700 rounded"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          )}
          <ChevronDown className={cn(
            'w-4 h-4 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )} />
        </div>
      </button>

      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}

      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
              />
              {isLoading && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto">
            {displayOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {isLoading ? 'Loading...' : emptyMessage}
              </div>
            ) : (
              displayOptions.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => !option.disabled && handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  disabled={option.disabled}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    index === highlightedIndex && 'bg-slate-700/50',
                    option.id === value && 'bg-sky-500/10',
                    option.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {showAvatars && (
                    option.avatar ? (
                      <img
                        src={option.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                    )
                  )}

                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white truncate">
                      {option.label}
                    </span>
                    {option.sublabel && (
                      <span className="block text-xs text-gray-400 truncate">
                        {option.sublabel}
                      </span>
                    )}
                  </div>

                  {option.id === value && (
                    <Check className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer with count */}
          {displayOptions.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-700 text-xs text-gray-500">
              {displayOptions.length} option{displayOptions.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;
