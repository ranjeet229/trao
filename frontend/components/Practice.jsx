'use client';
import { useMemo, useState } from 'react';
import { Check, RotateCcw, Eye, Layers } from 'lucide-react';
import { api, Button, Empty, Notice, Tag } from './ui';
export default function Practice({ record, onUpdate }) {
  const [revealed, setRevealed] = useState(false),
    [index, setIndex] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState(0);
  // Freeze the session ordering; a new session rebuilds it from updated confidence.
  const cards = useMemo(
    () =>
      [...record.kit.flashcards].sort(
        (a, b) =>
          (record.practice?.[a.id]?.confidence || 0) - (record.practice?.[b.id]?.confidence || 0) ||
          String(record.practice?.[a.id]?.lastReviewed || '').localeCompare(
            String(record.practice?.[b.id]?.lastReviewed || ''),
          ),
      ),
    [record._id, session],
  );
  const reviewed = record.kit.flashcards.filter((f) => record.practice?.[f.id]).length;
  const card = cards[index];
  async function rate(confidence) {
    setBusy(true);
    try {
      const { entry } = await api(`/kits/${record._id}/practice`, {
        method: 'POST',
        body: JSON.stringify({ cardId: card.id, confidence }),
      });
      onUpdate({ ...record, practice: { ...record.practice, [card.id]: entry } });
      setIndex(index + 1);
      setRevealed(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function restart() {
    setSession(session + 1);
    setIndex(0);
    setRevealed(false);
  }
  return (
    <div className="practice">
      <div className="section-heading">
        <div>
          <span className="eyebrow">A LITTLE BETTER, EVERY ROUND</span>
          <h2>Make it second nature.</h2>
          <p className="muted">Unseen cards first, then the ones you’re least confident about.</p>
        </div>
        <Tag>
          {reviewed} / {cards.length} covered
        </Tag>
      </div>
      <Notice>{error}</Notice>
      {!cards.length ? (
        <Empty icon={Layers} title="Your first flashcard is waiting">
          Add flashcards in the builder to start practising.
        </Empty>
      ) : !card ? (
        <Empty
          icon={Check}
          title="One session closer to ready."
          action={
            <Button onClick={restart}>
              <RotateCcw size={16} /> Start another session
            </Button>
          }
        >
          You worked through {cards.length} cards. Your next session will focus on what needs more
          attention.
        </Empty>
      ) : (
        <>
          <div className="practice-meta">
            <span>
              CARD {index + 1} OF {cards.length}
            </span>
            <span>
              {record.practice?.[card.id]
                ? `Previous confidence: ${['', 'Needs work', 'Getting there', 'Confident'][record.practice[card.id].confidence]}`
                : 'Not practised yet'}
            </span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${(index / cards.length) * 100}%` }} />
          </div>
          <div className="flashcard">
            <span className="eyebrow">
              {revealed ? 'ANSWER OUTLINE' : 'TAKE A MOMENT TO THINK'}
            </span>
            <h3>{card.front}</h3>
            {revealed ? (
              <div className="flashcard-answer">{card.back}</div>
            ) : (
              <Button variant="secondary" onClick={() => setRevealed(true)}>
                <Eye size={17} /> Reveal answer
              </Button>
            )}
          </div>
          {revealed && (
            <div className="confidence">
              <p>How did that feel?</p>
              <div>
                <Button variant="secondary" busy={busy} onClick={() => rate(1)}>
                  1 · Needs work
                </Button>
                <Button variant="secondary" busy={busy} onClick={() => rate(2)}>
                  2 · Getting there
                </Button>
                <Button busy={busy} onClick={() => rate(3)}>
                  3 · Confident
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
