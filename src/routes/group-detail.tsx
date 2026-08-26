import { useParams } from "@tanstack/react-router"

import { GroupDetailPageContent } from "@/features/groups/group-detail-page"

export function GroupDetailPage() {
  const { groupId } = useParams({ from: "/groups/$groupId" })
  return <GroupDetailPageContent groupId={groupId} />
}
