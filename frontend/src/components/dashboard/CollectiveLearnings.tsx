import { Lightbulb, CheckCircle } from 'lucide-react';

export interface Learning {
  id: string;
  type: 'pattern' | 'validated';
  title: string;
  description: string;
}

interface CollectiveLearningsProps {
  learnings: Learning[];
}

export function CollectiveLearnings({ learnings }: CollectiveLearningsProps) {
  if (learnings.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-medium mb-3 text-white">Collective Learnings</h4>
        <p className="text-xs text-gray-500">No learnings yet</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-3 text-white">Collective Learnings</h4>
      <div className="space-y-2">
        {learnings.map((learning) => (
          <div key={learning.id} className="p-2 bg-swarm-dark rounded-lg text-xs">
            <div className="flex items-center gap-2 mb-1">
              {learning.type === 'pattern' ? (
                <>
                  <Lightbulb className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400">New Pattern</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Validated</span>
                </>
              )}
            </div>
            <p className="text-gray-400">{learning.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
