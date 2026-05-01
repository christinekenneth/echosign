'use client';

import { useState } from 'react';
import EchoAvatar from '@/components/EchoAvatar';
import TileGrid from '@/components/TileGrid';
import ProgressBar from '@/components/ProgressBar';
import LanguageSelector from '@/components/LanguageSelector';

type Screen = 'welcome' | 'issue' | 'record' | 'confirm' | 'status';
type Language = 'en' | 'yo' | 'ha' | 'ig' | 'fr';

const API_URL = 'http://localhost:3001/api';

const ISSUES = [
  { id: 'money', icon: '💸', label: 'Money not received' },
  { id: 'card', icon: '💳', label: 'Card not working' },
  { id: 'atm', icon: '🏧', label: 'ATM problem' },
  { id: 'login', icon: '🔒', label: 'Cannot log in' },
  { id: 'stolen', icon: '⚠️', label: 'Stolen money' },
  { id: 'other', icon: '❓', label: 'Something else' },
];

const BUBBLES = {
  welcome: {
    en: '"Welcome! How would you like to communicate with us today?"',
    yo: '"Kaabo! Bawo ni o se fẹ sọrọ pẹlu wa loni?"',
    ha: '"Barka! Ta yaya kake so ka yi magana da mu yau?"',
    ig: '"Nnọọ! Kedu ka ị chọrọ ikwu okwu anyị taa?"',
    fr: '"Bienvenue! Comment souhaitez-vous communiquer avec nous?"',
  },
  issue: {
    en: '"What is the problem? Tap the picture that matches your issue."',
    yo: '"Kini iṣoro naa? Tẹ aworan ti o baamu iṣoro rẹ."',
    ha: '"Menene matsalar? Danna hoton da yayi daidai da matsalarka."',
    ig: '"Gịnị bụ nsogbu? Pịa onyonyo nke dabara na nsogbu gị."',
    fr: '"Quel est le problème?"',
  },
  record: {
    en: '"Sign your complaint in the camera below. I will read your signs."',
    yo: '"Koka iṣoro rẹ ninu kaamera ẹkọ."',
    ha: '"Jajjaya karar ka a cikin kamera."',
    ig: '"Dee nnukwu ọjụ gị na igwe onyonyo."',
    fr: '"Signez votre plainte dans la caméra."',
  },
  confirm: {
    en: '"I understood your complaint. Is this correct? Tap yes to send."',
    yo: '"Mo gbọ́ iṣoro rẹ. Ṣe o tọ́ báyìí?"',
    ha: '"Na gani kararka. Shin haka ne?"',
    ig: '"Achọpụtara m ihe ị na-ekwu. Ọ dịrị mma?"',
    fr: '"J\'ai compris votre plainte. Est-ce correct?"',
  },
  status: {
    en: '"Complaint sent! I will sign the bank\'s reply when it arrives."',
    yo: '"Iṣoro ti fi yii!"',
    ha: '"An aika karar!"',
    ig: '"Ezipụwo ihe ntaghachighachi!"',
    fr: '"Plainte envoyée!"',
  },
};

export default function WidgetPage() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [loading, setLoading] = useState(false);
  const [complaintId, setComplaintId] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState('');
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');

  const handleModeSelect = (selected: 'sign' | 'type') => {
    setTimeout(() => setScreen('issue'), 300);
  };

  const handleIssueSelect = (issueId: string) => {
    setSelectedIssue(issueId);
  };

  const handleContinue = () => {
    if (selectedIssue) setScreen('record');
  };

  const handleSubmitComplaint = async () => {
    if (!userPhone || !userName) {
      setError('Please enter your phone and name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userPhone,
          name: userName,
          language,
          issue_type: selectedIssue,
          description: `Customer reported: ${ISSUES.find(i => i.id === selectedIssue)?.label}`,
          confidence_score: 82,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit');
      const data = await response.json();
      setComplaintId(data.id);
      setScreen('status');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-black rounded-3xl p-3 shadow-2xl border-8 border-gray-900">
          <div className="bg-[#0A1628] rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center px-4 py-2 bg-[#0A1628] text-white text-xs">
              <span>9:41</span>
              <span className="text-[#00D4AA]">EchoSign</span>
              <span>100%</span>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-[#0A1628] border-b border-gray-700">
              <div className="w-7 h-7 rounded bg-[#00D4AA] flex items-center justify-center text-[#0A1628] font-bold text-xs">
                ES
              </div>
              <span className="flex-1 text-white font-bold text-sm">EchoSign</span>
              <LanguageSelector value={language} onChange={setLanguage} />
            </div>

            <div className="bg-[#F7F8FC] min-h-96 flex flex-col">
              <EchoAvatar isSigning={screen !== 'status'} bubble={BUBBLES[screen][language]} onReplay={() => {}} />

              <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto">
                {error && <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}

                {screen === 'welcome' && (
                  <>
                    <input type="tel" placeholder="Phone" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                    <input type="text" placeholder="Name" value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Choose your mode</p>
                    <TileGrid tiles={[{ id: 'sign', icon: '🤟', label: 'Sign language' }, { id: 'type', icon: '✏️', label: 'Type it' }]} onSelect={handleModeSelect} />
                  </>
                )}

                {screen === 'issue' && (
                  <>
                    <ProgressBar current={1} total={4} />
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">What is the problem?</p>
                    <TileGrid tiles={ISSUES.map((i) => ({ id: i.id, icon: i.icon, label: i.label }))} selected={selectedIssue} onSelect={handleIssueSelect} />
                    {selectedIssue && <button onClick={handleContinue} className="w-full bg-[#0A1628] text-white py-3 rounded-lg font-bold text-sm">Continue →</button>}
                  </>
                )}

                {screen === 'record' && (
                  <>
                    <ProgressBar current={2} total={4} />
                    <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-5 text-center flex flex-col gap-2">
                      <div className="text-3xl">📹</div>
                      <p className="text-sm font-bold text-gray-900">Sign here</p>
                      <p className="text-xs text-gray-500">🔒 Video never leaves your phone</p>
                      <button onClick={() => setScreen('confirm')} className="w-full bg-[#00D4AA] text-[#0A1628] py-2 rounded font-bold text-sm">
                        Start signing
                      </button>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3 text-xs">
                      <div className="flex justify-between">
                        <span>Confidence</span>
                        <span className="text-[#00C896] font-bold">82% — Good</span>
                      </div>
                      <div className="bg-gray-200 h-1 rounded mt-1 overflow-hidden">
                        <div className="bg-[#00C896] h-full w-4/5"></div>
                      </div>
                    </div>
                  </>
                )}

                {screen === 'confirm' && (
                  <>
                    <ProgressBar current={3} total={4} />
                    <div className="bg-[#F0FBF9] border border-[#00D4AA] rounded-lg p-3 text-sm">
                      <div className="flex gap-2 items-start mb-2">
                        <div className="text-2xl">{ISSUES.find((i) => i.id === selectedIssue)?.icon}</div>
                        <p className="text-xs text-gray-600">{ISSUES.find((i) => i.id === selectedIssue)?.label}</p>
                      </div>
                      <p className="text-xs text-gray-500">This is what will be sent to your bank</p>
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Is this correct?</p>
                    <TileGrid tiles={[{ id: 'yes', icon: '✅', label: 'Yes, send it' }, { id: 'no', icon: '↩️', label: 'No, redo it' }]} onSelect={(id) => (id === 'yes' ? handleSubmitComplaint() : setScreen('record'))} />
                  </>
                )}

                {screen === 'status' && (
                  <>
                    <div className="bg-[#F0FBF9] border border-[#00D4AA] rounded-lg p-3 text-sm mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-[#00C896]">{complaintId?.slice(0, 12) || 'EC-'}</span>
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-bold">Submitted</span>
                      </div>
                      <p className="font-bold text-gray-900 flex items-center gap-1">
                        <span>{ISSUES.find((i) => i.id === selectedIssue)?.icon}</span>
                        {ISSUES.find((i) => i.id === selectedIssue)?.label}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Status</p>
                    <div className="space-y-3 text-sm">
                      {[{ dot: '✓', title: 'Bank received complaint', time: 'Just now', done: true }, { dot: '●', title: 'Staff reviewing', time: 'Now', done: false, active: true }, { dot: '○', title: 'Resolved', time: 'Pending', done: false }].map((item, i) => (
                        <div key={i} className="flex gap-2">
                          <div className={`flex-shrink-0 ${item.done ? 'text-[#00C896]' : item.active ? 'text-[#0A1628]' : 'text-gray-300'}`}>{item.dot}</div>
                          <div>
                            <p className={`text-xs font-bold ${item.done || item.active ? 'text-gray-900' : 'text-gray-400'}`}>{item.title}</p>
                            <p className="text-xs text-gray-500">{item.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {screen === 'status' && (
                <div className="flex justify-around items-center px-2 py-2 border-t border-gray-200 bg-white">
                  {['Home', 'Complaints', 'Help', 'Settings'].map((tab, i) => (
                    <div key={tab} className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-5 h-1 rounded ${i === 1 ? 'bg-[#0A1628]' : 'bg-gray-300'}`}></div>
                      <span className={`text-xs ${i === 1 ? 'text-[#0A1628] font-bold' : 'text-gray-400'}`}>{tab}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
