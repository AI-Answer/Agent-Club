import {
  collectMissingVaultKeys,
  collectRequiredEnvForSkillNames,
} from '@/common/skills/agentVaultContent';
import { Alert, Button } from '@arco-design/web-react';
import { Link } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type SkillEnvSource = {
  name: string;
  requiredEnv?: string[];
};

type SkillEnvRequirementsBannerProps = {
  skills: SkillEnvSource[];
  selectedSkillNames: string[];
  vaultKeys: string[];
  vaultEnabled: boolean;
  className?: string;
};

const SkillEnvRequirementsBanner: React.FC<SkillEnvRequirementsBannerProps> = ({
  skills,
  selectedSkillNames,
  vaultKeys,
  vaultEnabled,
  className,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const requiredKeys = useMemo(
    () => collectRequiredEnvForSkillNames(skills, selectedSkillNames),
    [skills, selectedSkillNames]
  );

  const missingKeys = useMemo(
    () => collectMissingVaultKeys(requiredKeys, vaultKeys),
    [requiredKeys, vaultKeys]
  );

  if (requiredKeys.length === 0) {
    return null;
  }

  if (missingKeys.length === 0 && vaultEnabled) {
    return (
      <Alert
        className={className}
        type='success'
        showIcon
        content={t('settings.securityPage.skillEnvReady', { keys: requiredKeys.join(', ') })}
      />
    );
  }

  const content = !vaultEnabled
    ? t('settings.securityPage.skillEnvVaultDisabled', { keys: missingKeys.join(', ') })
    : t('settings.securityPage.skillEnvMissing', { keys: missingKeys.join(', ') });

  return (
    <Alert
      className={className}
      type='warning'
      showIcon
      content={
        <div className='flex flex-col gap-8px'>
          <span>{content}</span>
          <Button
            type='text'
            size='small'
            className='!w-fit !px-0'
            icon={<Link theme='outline' size='14' />}
            onClick={() => navigate('/settings/security')}
          >
            {t('settings.securityPage.openSkillSecrets')}
          </Button>
        </div>
      }
    />
  );
};

export default SkillEnvRequirementsBanner;
