import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import type { SmileInviteStatus } from '../state/types';

const messages: Partial<Record<SmileInviteStatus, string>> = {
  expired: 'Срок приглашения истёк. Попросите отправителя создать новую ссылку.',
  used: 'Это одноразовое приглашение уже активировано другим участником. Попросите отдельную ссылку.',
  revoked: 'Отправитель отозвал это приглашение. Попросите новую ссылку.',
  already: 'Это приглашение уже использовано вашим аккаунтом, а доступ к тесту сейчас закрыт. Обратитесь к отправителю.',
  unavailable: 'Не удалось проверить приглашение. Проверьте соединение и попробуйте ещё раз.',
};

export function ScreenSmileInviteNotice({ status, onContinue, onRetry }: {
  status?: SmileInviteStatus;
  onContinue: () => void;
  onRetry: () => void;
}) {
  return <Screen>
    <ScreenIntro title="Приглашение на примерку" sub="Закрытый тест LabFrame" />
    <div style={{ padding: '0 16px', maxWidth: 620, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
      <Card kind="dark" pad={18} radius={18}>
        <p role="status" style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
          {messages[status ?? 'invalid'] ?? 'Не удалось подтвердить доступ по этой ссылке. Проверьте приглашение у отправителя.'}
        </p>
        {status === 'unavailable' && <button type="button" onClick={onRetry} style={{
          width: '100%', padding: 14, marginBottom: 10, border: 0, borderRadius: 12,
          background: 'var(--c-accent)', color: 'var(--c-ink)', fontWeight: 600,
        }}>Проверить ещё раз</button>}
        <button type="button" onClick={onContinue} style={{
          width: '100%', padding: 14, border: '1px solid var(--c-line)', borderRadius: 12,
          background: 'transparent', color: 'var(--c-on-dark)',
        }}>Открыть LabFrame</button>
      </Card>
    </div>
  </Screen>;
}
