/**
 * AR 미니맵 — vanilla Leaflet 기반.
 *
 * 번들 분리:
 *  - PlayPage 에서 `lazy(() => import('./components/MiniMap'))` 로 참조 → Leaflet
 *    런타임이 MiniMap 청크에 함께 포함되어 PlayPage 메인 청크에 섞이지 않음.
 *  - 'leaflet/dist/leaflet.css' 는 이 파일에서만 import → 같은 청크로 묶임.
 *
 * 설계:
 *  - React-Leaflet 금지 (프롬프트 명시). `L.map` / `L.tileLayer` / `L.circle` /
 *    `L.circleMarker` API 만 사용.
 *  - useEffect 삼분할: (1) map 생성/정리 (mount 1회), (2) zones 증감·스타일 업데이트,
 *    (3) 내 위치·accuracy 업데이트. StrictMode cleanup 에서 map.remove() 필수.
 *  - Props 변경 시 Map 재생성하지 않음 — `setLatLng` / `setRadius` / `setStyle` 로
 *    기존 레이어만 수정.
 *  - OSM 타일 + attribution (라이선스 의무).
 */

import { useEffect, useRef } from 'react'
import L, {
  type Circle as LeafletCircle,
  type CircleMarker as LeafletCircleMarker,
  type Map as LeafletMap,
  type LatLngBoundsLiteral,
} from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styles from './MiniMap.module.css'

export interface MiniMapZone {
  id: string
  name: string
  center_lat: number
  center_lng: number
  radius_m: number
}

export interface MiniMapProps {
  center: { lat: number; lng: number }
  zones: MiniMapZone[]
  currentZoneId: string | null
  /** GPS 정확도(m). 0 이하 시 accuracy 원 미표시. */
  currentAccuracy: number
  className?: string
}

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const ZONE_COLOR = '#2563EB'
const ZONE_ACTIVE_COLOR = '#DC2626'
const POSITION_COLOR = '#10B981'

export default function MiniMap({
  center,
  zones,
  currentZoneId,
  currentAccuracy,
  className,
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<LeafletCircleMarker | null>(null)
  const accuracyCircleRef = useRef<LeafletCircle | null>(null)
  const zoneCirclesRef = useRef<Map<string, LeafletCircle>>(new Map())
  const initialFitDoneRef = useRef(false)

  // Mount 1회: map 생성 + OSM 타일. StrictMode cleanup 이 둘 다 해제.
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
    const map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
      dragging: true,
    }).setView([center.lat, center.lng], 16)
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      posMarkerRef.current = null
      accuracyCircleRef.current = null
      zoneCirclesRef.current.clear()
      initialFitDoneRef.current = false
    }
    // center 초기값 변경으로 map 재생성되면 안 됨 — 초기 center 는 첫 mount 시만 사용.
    // 이후 center 업데이트는 position effect 에서 posMarker/accuracyCircle 에 반영.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // zones 증감·스타일 업데이트
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const existing = zoneCirclesRef.current
    const newIds = new Set(zones.map(z => z.id))

    // 제거된 zone 정리
    for (const [id, circle] of existing) {
      if (!newIds.has(id)) {
        circle.remove()
        existing.delete(id)
      }
    }

    // 생성·업데이트
    for (const z of zones) {
      const isActive = z.id === currentZoneId
      const color = isActive ? ZONE_ACTIVE_COLOR : ZONE_COLOR
      const fillOpacity = isActive ? 0.25 : 0.12
      let circle = existing.get(z.id)
      if (!circle) {
        circle = L.circle([z.center_lat, z.center_lng], {
          radius: z.radius_m,
          color,
          weight: 2,
          fillOpacity,
        }).addTo(map)
        existing.set(z.id, circle)
      } else {
        circle.setLatLng([z.center_lat, z.center_lng])
        circle.setRadius(z.radius_m)
        circle.setStyle({ color, fillOpacity })
      }
    }

    // 초기 fitBounds 1회 — zones 존재할 때만
    if (!initialFitDoneRef.current && zones.length > 0) {
      const bounds: LatLngBoundsLiteral = zones.map(z => [z.center_lat, z.center_lng])
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
      initialFitDoneRef.current = true
    }
  }, [zones, currentZoneId])

  // 내 위치 + accuracy 원 업데이트
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!posMarkerRef.current) {
      posMarkerRef.current = L.circleMarker([center.lat, center.lng], {
        radius: 6,
        color: '#FFFFFF',
        weight: 2,
        fillColor: POSITION_COLOR,
        fillOpacity: 1,
      }).addTo(map)
    } else {
      posMarkerRef.current.setLatLng([center.lat, center.lng])
    }

    if (currentAccuracy > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle([center.lat, center.lng], {
          radius: currentAccuracy,
          color: POSITION_COLOR,
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(map)
      } else {
        accuracyCircleRef.current.setLatLng([center.lat, center.lng])
        accuracyCircleRef.current.setRadius(currentAccuracy)
      }
    } else if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove()
      accuracyCircleRef.current = null
    }
  }, [center.lat, center.lng, currentAccuracy])

  return (
    <div
      ref={containerRef}
      className={[styles.map, className].filter(Boolean).join(' ')}
    />
  )
}
