import React, { useState, useCallback } from 'react';
import {
  Wrench,
  Plus,
  Trash2,
  Save,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  Code,
  FileText,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import api from '../../services/api';
import type { CustomTool } from '../../types/frontend';

export interface CustomToolEditorProps {
  /** Workspace ID for tool association */
  workspaceId?: string;
  /** Existing tool to edit (undefined for new tool) */
  tool?: CustomTool;
  /** Callback when tool is saved */
  onSave: (tool: CustomTool) => void;
  /** Callback when editor is closed */
  onClose: () => void;
  /** Additional className */
  className?: string;
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
}

const PARAMETER_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

const DEFAULT_PYTHON_CODE = `#!/usr/bin/env python3
"""
Tool: {{tool_name}}
Description: {{description}}
"""
import json
import sys

def main(inputs: dict) -> dict:
    """
    Main entry point for the tool.

    Args:
        inputs: Dictionary containing input parameters

    Returns:
        Dictionary containing output data
    """
    # Your tool logic here
    result = inputs.get('input_value', 'default')

    return {
        'result': result,
        'status': 'success'
    }

if __name__ == '__main__':
    # Parse inputs from command line
    inputs = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    result = main(inputs)
    print(json.dumps(result))
`;

/**
 * CustomToolEditor - Editor for creating and editing custom Python tools
 * Used by Agentic AI agents to create tools that become FlowBuilder nodes
 */
export const CustomToolEditor: React.FC<CustomToolEditorProps> = ({
  workspaceId,
  tool,
  onSave,
  onClose,
  className,
}) => {
  const isEditing = !!tool;

  // Tool metadata
  const [name, setName] = useState(tool?.name || '');
  const [displayName, setDisplayName] = useState(tool?.displayName || '');
  const [description, setDescription] = useState(tool?.description || '');
  const [category, setCategory] = useState(tool?.category || 'custom');

  // Parameters
  const [inputs, setInputs] = useState<ToolParameter[]>(
    tool?.inputs?.map(i => ({
      name: i.name,
      type: i.type,
      required: i.required,
      description: i.description || '',
    })) || [{ name: 'input_value', type: 'string', required: true, description: '' }]
  );
  const [outputs, setOutputs] = useState<ToolParameter[]>(
    tool?.outputs?.map(o => ({
      name: o.name,
      type: o.type,
      required: true,
      description: o.description || '',
    })) || [{ name: 'result', type: 'string', required: true, description: '' }]
  );

  // Python code
  const [code, setCode] = useState(
    tool?.scriptPath
      ? '' // Will be loaded from server
      : DEFAULT_PYTHON_CODE
          .replace('{{tool_name}}', name || 'my_tool')
          .replace('{{description}}', description || 'A custom tool')
  );
  const [codeLoading, setCodeLoading] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; output?: unknown; error?: string } | null>(null);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'code' | 'test'>('code');

  // Note: Editing existing tools not fully supported yet
  // The tool code is stored in the scriptPath but no endpoint to retrieve it
  React.useEffect(() => {
    if (tool?.id) {
      // For now, show a message that editing code isn't supported
      setCode('# Tool code editing not supported. Create a new tool instead.');
      setCodeLoading(false);
    }
  }, [tool?.id]);

  // Parameter management
  const addInput = () => {
    setInputs([...inputs, { name: '', type: 'string', required: false, description: '' }]);
  };

  const removeInput = (index: number) => {
    setInputs(inputs.filter((_, i) => i !== index));
  };

  const updateInput = (index: number, field: keyof ToolParameter, value: string | boolean) => {
    const updated = [...inputs];
    updated[index] = { ...updated[index], [field]: value };
    setInputs(updated);
  };

  const addOutput = () => {
    setOutputs([...outputs, { name: '', type: 'string', required: true, description: '' }]);
  };

  const removeOutput = (index: number) => {
    setOutputs(outputs.filter((_, i) => i !== index));
  };

  const updateOutput = (index: number, field: keyof ToolParameter, value: string | boolean) => {
    const updated = [...outputs];
    updated[index] = { ...updated[index], [field]: value };
    setOutputs(updated);
  };

  // Validation
  const validate = (): string | null => {
    if (!name.trim()) return 'Tool name is required';
    if (!/^[a-z][a-z0-9_]*$/.test(name.trim())) {
      return 'Tool name must start with a letter and contain only lowercase letters, numbers, and underscores';
    }
    if (!displayName.trim()) return 'Display name is required';
    if (!description.trim()) return 'Description is required';
    if (inputs.some(i => !i.name.trim())) return 'All input parameters must have names';
    if (outputs.some(o => !o.name.trim())) return 'All output parameters must have names';
    if (!code.trim()) return 'Python code is required';
    if (!code.includes('def main(')) return 'Code must contain a main(inputs: dict) function';
    return null;
  };

  // Save tool
  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Cannot edit existing tools - only create new ones
    if (isEditing) {
      setError('Editing existing tools is not supported. Please create a new tool.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const toolData = {
        workspaceId,
        name: name.trim(),
        displayName: displayName.trim(),
        description: description.trim(),
        category: category.trim() || 'custom',
        inputs: inputs.filter(i => i.name.trim()).map(i => ({
          name: i.name.trim(),
          type: i.type,
          required: i.required,
          description: i.description.trim() || undefined,
        })),
        outputs: outputs.filter(o => o.name.trim()).map(o => ({
          name: o.name.trim(),
          type: o.type,
          description: o.description.trim() || undefined,
        })),
        scriptCode: code.trim(),
      };

      const response = await api.post('/agentic/tools', toolData);

      if (response.data?.tool) {
        onSave(response.data.tool);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save tool';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Test tool - requires an existing saved tool
  const handleTest = async () => {
    if (!tool?.id) {
      setError('Please save the tool first before testing. Testing requires a saved tool.');
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsTesting(true);
    setError(null);
    setTestResult(null);

    try {
      // Convert test inputs to proper types
      const parsedInputs: Record<string, unknown> = {};
      for (const input of inputs) {
        const value = testInputs[input.name];
        if (value !== undefined) {
          switch (input.type) {
            case 'number':
              parsedInputs[input.name] = parseFloat(value) || 0;
              break;
            case 'boolean':
              parsedInputs[input.name] = value === 'true';
              break;
            case 'object':
            case 'array':
              try {
                parsedInputs[input.name] = JSON.parse(value);
              } catch {
                parsedInputs[input.name] = value;
              }
              break;
            default:
              parsedInputs[input.name] = value;
          }
        }
      }

      const response = await api.post(`/agentic/tools/${tool.id}/test`, {
        inputs: parsedInputs,
      });

      setTestResult({
        success: response.data?.success ?? true,
        output: response.data?.output,
        error: response.data?.error,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Test execution failed';
      setTestResult({ success: false, error: message });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Wrench className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Custom Tool' : 'Create Custom Tool'}
            </h3>
            <p className="text-sm text-gray-400">
              {isEditing ? `Editing: ${tool.displayName}` : 'Define a Python tool for your agent'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={isLoading} icon={<Save className="w-4 h-4" />}>
            Save Tool
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel - Tool Definition */}
        <div className="w-1/3 border-r border-slate-700 p-4 overflow-y-auto">
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Basic Information
              </h4>

              <Input
                label="Tool Name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="my_custom_tool"
                helperText="Lowercase with underscores (e.g., web_scraper)"
              />

              <Input
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Custom Tool"
                helperText="Human-readable name for the UI"
              />

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-300">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this tool does..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <Input
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="custom"
                helperText="Grouping for FlowBuilder sidebar"
              />
            </div>

            {/* Input Parameters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Input Parameters
                </h4>
                <Button variant="ghost" size="sm" onClick={addInput} icon={<Plus className="w-3 h-3" />}>
                  Add
                </Button>
              </div>

              {inputs.map((input, index) => (
                <div key={index} className="p-3 bg-slate-800/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={input.name}
                      onChange={(e) => updateInput(index, 'name', e.target.value)}
                      placeholder="param_name"
                      className="flex-1"
                    />
                    <select
                      value={input.type}
                      onChange={(e) => updateInput(index, 'type', e.target.value)}
                      className="px-2 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                    >
                      {PARAMETER_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeInput(index)}
                      icon={<Trash2 className="w-3 h-3 text-red-400" />}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={input.required}
                        onChange={(e) => updateInput(index, 'required', e.target.checked)}
                        className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-purple-500"
                      />
                      Required
                    </label>
                    <input
                      value={input.description}
                      onChange={(e) => updateInput(index, 'description', e.target.value)}
                      placeholder="Description..."
                      className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white placeholder-gray-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Output Parameters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Output Parameters
                </h4>
                <Button variant="ghost" size="sm" onClick={addOutput} icon={<Plus className="w-3 h-3" />}>
                  Add
                </Button>
              </div>

              {outputs.map((output, index) => (
                <div key={index} className="p-3 bg-slate-800/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={output.name}
                      onChange={(e) => updateOutput(index, 'name', e.target.value)}
                      placeholder="output_name"
                      className="flex-1"
                    />
                    <select
                      value={output.type}
                      onChange={(e) => updateOutput(index, 'type', e.target.value)}
                      className="px-2 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                    >
                      {PARAMETER_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOutput(index)}
                      icon={<Trash2 className="w-3 h-3 text-red-400" />}
                    />
                  </div>
                  <input
                    value={output.description}
                    onChange={(e) => updateOutput(index, 'description', e.target.value)}
                    placeholder="Description..."
                    className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white placeholder-gray-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Code & Test */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className="flex items-center border-b border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={cn(
                'px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                activeTab === 'code'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              )}
            >
              <Code className="w-4 h-4" />
              Python Code
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('test')}
              className={cn(
                'px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                activeTab === 'test'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              )}
            >
              <Play className="w-4 h-4" />
              Test
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'code' ? (
              <div className="h-full p-4">
                {codeLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  </div>
                ) : (
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full h-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-gray-300 font-mono resize-none focus:outline-none focus:border-purple-500"
                    spellCheck={false}
                    placeholder="#!/usr/bin/env python3..."
                  />
                )}
              </div>
            ) : (
              <div className="h-full p-4 flex flex-col">
                <div className="space-y-4 flex-1 overflow-y-auto">
                  {/* Test Inputs */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Test Inputs</h4>
                    {inputs.length === 0 ? (
                      <p className="text-sm text-gray-500">No input parameters defined</p>
                    ) : (
                      inputs.map((input) => (
                        <Input
                          key={input.name}
                          label={`${input.name} (${input.type})${input.required ? ' *' : ''}`}
                          value={testInputs[input.name] || ''}
                          onChange={(e) => setTestInputs({ ...testInputs, [input.name]: e.target.value })}
                          placeholder={input.type === 'object' || input.type === 'array' ? 'JSON value' : `Enter ${input.type}`}
                        />
                      ))
                    )}
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <div className={cn(
                      'p-4 rounded-lg border',
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                    )}>
                      <div className="flex items-center gap-2 mb-2">
                        {testResult.success ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        )}
                        <span className={cn(
                          'font-medium',
                          testResult.success ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {testResult.success ? 'Test Passed' : 'Test Failed'}
                        </span>
                      </div>
                      {testResult.error && (
                        <pre className="text-sm text-red-300 font-mono whitespace-pre-wrap">
                          {testResult.error}
                        </pre>
                      )}
                      {testResult.output !== undefined && (
                        <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap bg-slate-800 p-2 rounded mt-2">
                          {JSON.stringify(testResult.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleTest}
                  loading={isTesting}
                  fullWidth
                  icon={<Play className="w-4 h-4" />}
                  className="mt-4"
                >
                  Run Test
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

CustomToolEditor.displayName = 'CustomToolEditor';

export default CustomToolEditor;
