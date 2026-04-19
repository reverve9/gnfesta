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
 *  - useEffect 삼분할: (1) map 생성/정리 (mount 1회), (2) geofence 업데이트,
 *    (3) 내 위치·accuracy 업데이트. StrictMode cleanup 에서 map.remove() 필수.
 *  - Props 변경 시 Map 재생성하지 않음 — `setLatLng` / `setRadius` / `setStyle` 로
 *    기존 레이어만 수정.
 *  - OSM 타일 + attribution (라이선스 의무).
 *
 * Phase 3-R2 재설계:
 *  - 다중 zone 모델 폐기 → 단일 geofence circle 렌더.
 *  - props 에서 `zones[] + currentZoneId` 제거, `geofence: {center, radius} | null` 추가.
 */

import { useEffect, useRef } from 'react'
import L, {
  type Circle as LeafletCircle,
  type CircleMarker as LeafletCircleMarker,
  type Map as LeafletMap,
} from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styles from './MiniMap.module.css'

export interface MiniMapGeofence {
  center: { lat: number; lng: number }
  radiusM: number
}

export interface MiniMapProps {
  /** 내 위치. null 이면 marker 미표시 (맵 중심은 geofence 중심으로 유지). */
  userPosition: { lat: number; lng: number } | null
  /** 축제장 단일 geofence. null = 아직 로드 전. */
  geofence: MiniMapGeofence | null
  /** inside 여부로 geofence circle 스타일 전환(밖=파랑 / 안=빨강 강조). */
  inside: boolean
  /** GPS 정확도(m). 0 이하 시 accuracy 원 미표시. */
  currentAccuracy: number
  className?: string
}

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const GEOFENCE_COLOR = '#2563EB'
const GEOFENCE_INSIDE_COLOR = '#DC2626'
const POSITION_COLOR = '#10B981'

/** geofence 가 오기 전 map 중심 초기값 — 경포해변 중앙 추정. 로드 후 즉시 교체됨. */
const INITIAL_FALLBACK_CENTER: L.LatLngExpression = [37.7985, 128.899]

export default function MiniMap({
  userPosition,
  geofence,
  inside,
  currentAccuracy,
  className,
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<LeafletCircleMarker | null>(null)
  const accuracyCircleRef = useRef<LeafletCircle | null>(null)
  const geofenceCircleRef = useRef<LeafletCircle | null>(null)
  const initialFitDoneRef = useRef(false)

  // Mount 1회: map 생성 + OSM 타일. StrictMode cleanup 이 둘 다 해제.
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
    const map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
      dragging: true,
    }).setView(INITIAL_FALLBACK_CENTER, 16)
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
      geofenceCircleRef.current = null
      initialFitDoneRef.current = false
    }
  }, [])

  // geofence circle 업데이트 (center/radius/style)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!geofence) {
      if (geofenceCircleRef.current) {
        geofenceCircleRef.current.remove()
        geofenceCircleRef.current = null
      }
      return
    }

    const color = inside ? GEOFENCE_INSIDE_COLOR : GEOFENCE_COLOR
    const fillOpacity = inside ? 0.2 : 0.1

    if (!geofenceCircleRef.current) {
      geofenceCircleRef.current = L.circle(
        [geofence.center.lat, geofence.center.lng],
        {
          radius: geofence.radiusM,
          color,
          weight: 2,
          fillOpacity,
        },
      ).addTo(map)
    } else {
      geofenceCircleRef.current.setLatLng([geofence.center.lat, geofence.center.lng])
      geofenceCircleRef.current.setRadius(geofence.radiusM)
      geofenceCircleRef.current.setStyle({ color, fillOpacity })
    }

    // 초기 fitBounds 1회 — geofence 로드 직후 맵 줌 맞춤
    if (!initialFitDoneRef.current) {
      map.fitBounds(geofenceCircleRef.current.getBounds(), {
        padding: [40, 40],
        maxZoom: 17,
      })
      initialFitDoneRef.current = true
    }
  }, [geofence, inside])

  // 내 위치 + accuracy 원 업데이트
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!userPosition) {
      if (posMarkerRef.current) {
        posMarkerRef.current.remove()
        posMarkerRef.current = null
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove()
        accuracyCircleRef.current = null
      }
      return
    }

    if (!posMarkerRef.current) {
      posMarkerRef.current = L.circleMarker(
        [userPosition.lat, userPosition.lng],
        {
          radius: 6,
          color: '#FFFFFF',
          weight: 2,
          fillColor: POSITION_COLOR,
          fillOpacity: 1,
        },
      ).addTo(map)
    } else {
      posMarkerRef.current.setLatLng([userPosition.lat, userPosition.lng])
    }

    if (currentAccuracy > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle(
          [userPosition.lat, userPosition.lng],
          {
            radius: currentAccuracy,
            color: POSITION_COLOR,
            weight: 1,
            fillOpacity: 0.08,
          },
        ).addTo(map)
      } else {
        accuracyCircleRef.current.setLatLng([userPosition.lat, userPosition.lng])
        accuracyCircleRef.current.setRadius(currentAccuracy)
      }
    } else if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove()
      accuracyCircleRef.current = null
    }
  }, [userPosition, currentAccuracy])

  return (
    <div
      ref={containerRef}
      className={[styles.map, className].filter(Boolean).join(' ')}
    />
  )
}
