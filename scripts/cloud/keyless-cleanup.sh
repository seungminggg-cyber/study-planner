#!/usr/bin/env bash
# 열쇠 없는 로그인이 잘 되는 걸 확인한 뒤에 실행: 예전 열쇠(서비스 계정 키)를 지우고, 예전 계정에 더했던 큰 권한을 되돌려요.
# 실행: Google Cloud 콘솔 Cloud Shell 에 통째로 붙여넣기
set -u
P=seungmin-planner
gcloud config set project $P -q
OLD=$(gcloud iam service-accounts list --filter="email~^firebase-adminsdk" --format="value(email)" | head -1)
for K in $(gcloud iam service-accounts keys list --iam-account=$OLD --managed-by=user --format="value(name)"); do
  gcloud iam service-accounts keys delete $K --iam-account=$OLD -q && echo "열쇠 삭제: ${K:0:8}…"
done
for ROLE in roles/editor roles/run.admin; do
  gcloud projects remove-iam-policy-binding $P --member=serviceAccount:$OLD --role=$ROLE --condition=None -q >/dev/null 2>&1 && echo "권한 되돌림: $ROLE"
done
echo "✅ 정리 완료"
