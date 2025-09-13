import React from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: (data: { candidateName: string; candidateEmail: string }) => void;
  newSessionData: {
    candidateName: string;
    candidateEmail: string;
  };
  onUpdateSessionData: (data: { candidateName: string; candidateEmail: string }) => void;
  createdSession?: {
    sessionId: string;
    candidateName: string;
  } | null;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onCreateSession,
  newSessionData,
  onUpdateSessionData,
  createdSession
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSessionData.candidateName.trim() && newSessionData.candidateEmail.trim()) {
      onCreateSession(newSessionData);
    }
  };

  const handleInputChange = (field: 'candidateName' | 'candidateEmail', value: string) => {
    onUpdateSessionData({
      ...newSessionData,
      [field]: value
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Interview Session</DialogTitle>
        </DialogHeader>
        
        {createdSession ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Session Created Successfully!</h3>
                <p className="text-gray-600 mb-2">
                  Session for <strong>{createdSession.candidateName}</strong>
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Session ID: <code className="bg-gray-100 px-2 py-1 rounded">{createdSession.sessionId}</code>
                </p>
                <p className="text-sm text-gray-600 mb-6">
                  The candidate will receive an email with joining instructions.
                </p>
                <Button onClick={onClose} className="w-full">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="candidateName" className="block text-sm font-medium text-gray-700 mb-1">
                Candidate Name
              </label>
              <Input
                id="candidateName"
                type="text"
                value={newSessionData.candidateName}
                onChange={(e) => handleInputChange('candidateName', e.target.value)}
                placeholder="Enter candidate's full name"
                required
              />
            </div>
            
            <div>
              <label htmlFor="candidateEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Candidate Email
              </label>
              <Input
                id="candidateEmail"
                type="email"
                value={newSessionData.candidateEmail}
                onChange={(e) => handleInputChange('candidateEmail', e.target.value)}
                placeholder="Enter candidate's email address"
                required
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={!newSessionData.candidateName.trim() || !newSessionData.candidateEmail.trim()}
              >
                Create Session
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};