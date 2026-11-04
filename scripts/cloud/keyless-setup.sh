#!/usr/bin/env bash
# GitHub Actions가 열쇠 파일(서비스 계정 키) 없이 Google에 로그인하도록 설정 (Workload Identity 연동)
# 실행: Google Cloud 콘솔 오른쪽 위 [>_] Cloud Shell 에 이 내용을 통째로 붙여넣기 (프로젝트 소유자 계정으로)
# 여러 번 실행해도 안전해요.
set -u
P=seungmin-planner
R=seungminggg-cyber/study-planner
SA=github-deployer@$P.iam.gserviceaccount.com
gcloud config set project $P -q
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com -q
gcloud iam service-accounts describe $SA >/dev/null 2>&1 || gcloud iam service-accounts create github-deployer --display-name="GitHub Actions (키 없이 로그인)" -q
for ROLE in roles/editor roles/run.admin roles/firebase.admin; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$SA --role=$ROLE --condition=None -q >/dev/null
done
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub" -q
gcloud iam workload-identity-pools providers describe study-planner --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc study-planner --location=global --workload-identity-pool=github \
    --display-name="study-planner" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$R'" -q
N=$(gcloud projects describe $P --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.repository/$R" -q >/dev/null
echo "✅ 완료 — Claude에게 '열쇠 없는 로그인 설정 완료'라고 알려 주세요"
