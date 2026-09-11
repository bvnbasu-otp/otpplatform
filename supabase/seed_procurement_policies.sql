-- Procurement OS policy rules — extend approval_policies.threshold JSON

UPDATE approval_policies SET threshold = '{
  "type": "simple_majority",
  "minVotes": 2,
  "minQuotesRequired": 3,
  "requestRoles": ["BUYER", "MANAGER"],
  "approveRoles": ["COMMITTEE_MEMBER", "MANAGER"],
  "awardRoles": ["MANAGER"],
  "evaluationWeights": {"price": 40, "delivery": 30, "warranty": 30},
  "committeeVoteRequired": true,
  "conflictDeclarationRequired": true,
  "awardRequiresJustification": true
}'::jsonb
WHERE id = 'a1000000-0000-4000-8000-000000000001';

UPDATE approval_policies SET threshold = threshold || '{
  "minQuotesRequired": 3,
  "requestRoles": ["BUYER", "MANAGER"],
  "approveRoles": ["COMMITTEE_MEMBER", "MANAGER"],
  "awardRoles": ["MANAGER"],
  "evaluationWeights": {"price": 35, "delivery": 35, "warranty": 30}
}'::jsonb
WHERE id = 'd2000022-0000-4000-8000-000000000001';

UPDATE approval_policies SET threshold = threshold || '{
  "minQuotesRequired": 3,
  "requestRoles": ["BUYER", "MANAGER"],
  "approveRoles": ["COMMITTEE_MEMBER", "MANAGER"],
  "awardRoles": ["MANAGER"],
  "evaluationWeights": {"price": 45, "delivery": 35, "warranty": 20}
}'::jsonb
WHERE id = 'd3000022-0000-4000-8000-000000000001';

UPDATE approval_policies SET threshold = threshold || '{
  "minQuotesRequired": 3,
  "requestRoles": ["BUYER", "MANAGER", "OWNER"],
  "approveRoles": ["MANAGER"],
  "awardRoles": ["MANAGER", "OWNER"],
  "evaluationWeights": {"price": 30, "delivery": 25, "warranty": 45}
}'::jsonb
WHERE id = 'd4000022-0000-4000-8000-000000000001';
