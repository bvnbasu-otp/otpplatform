export { AttributeFields } from './AttributeFields';
export type { AttributeFieldsProps } from './AttributeFields';
export { VoiceRequirementDictation } from './VoiceRequirementDictation';
export type { VoiceRequirementDictationProps } from './VoiceRequirementDictation';
export { VoiceTextRequirementIntakeModal } from './VoiceTextRequirementIntakeModal';
export type { VoiceTextRequirementIntakeModalProps } from './VoiceTextRequirementIntakeModal';
export { TemplatesAndExamplesModal, CANONICAL_TEMPLATES, CANONICAL_EXAMPLES } from './TemplatesAndExamplesModal';
export type { TemplatesAndExamplesModalProps, ProcurementTemplate, ProcurementExample } from './TemplatesAndExamplesModal';

// 6 Progressive Conversational Intake Steps
export { WhatDoYouNeedStep } from './steps/WhatDoYouNeedStep';
export type { WhatDoYouNeedStepProps } from './steps/WhatDoYouNeedStep';
export { WhereLocationStep } from './steps/WhereLocationStep';
export type { WhereLocationStepProps } from './steps/WhereLocationStep';
export { WhenAndBudgetStep } from './steps/WhenAndBudgetStep';
export type { WhenAndBudgetStepProps } from './steps/WhenAndBudgetStep';
export { ScopeAndSpecificationsStep } from './steps/ScopeAndSpecificationsStep';
export type { ScopeAndSpecificationsStepProps } from './steps/ScopeAndSpecificationsStep';
export { AttachmentsStep } from './steps/AttachmentsStep';
export type { AttachmentsStepProps } from './steps/AttachmentsStep';
export { ReviewAndPublishStep } from './steps/ReviewAndPublishStep';
export type { ReviewAndPublishStepProps } from './steps/ReviewAndPublishStep';

// Backward-compatible step exports
export { ScopeClassificationStep } from './steps/ScopeClassificationStep';
export { TechnicalSpecificationsStep } from './steps/TechnicalSpecificationsStep';
export { LogisticsAndCommercialStep } from './steps/LogisticsAndCommercialStep';
export { SourcingAndReviewStep } from './steps/SourcingAndReviewStep';
export { AttributesStep } from './steps/AttributesStep';
export { DescribeStep } from './steps/DescribeStep';
export { QualityCommercialStep } from './steps/QualityCommercialStep';
export { ReviewStep } from './steps/ReviewStep';
export { SourcingEvaluationStep } from './steps/SourcingEvaluationStep';
export { UnderstandingStep } from './steps/UnderstandingStep';
export { WhereWhenStep } from './steps/WhereWhenStep';
