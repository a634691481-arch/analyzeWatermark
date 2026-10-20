<script setup lang="ts">
/**
 * 鼠标跟随光斑卡片（Inspira UI · card-spotlight）。
 *
 * 相对原版改了三点：
 * 1. 去掉内置的 bg-neutral-* / text-* 配色，颜色交给调用方，避免和站点卡片体系打架；
 * 2. 根节点不再 flex（原版方向固定 row），内部用 slot 包装层控制布局；
 * 3. 光斑不写死 opacity-0 + 内联 opacity（内联会覆盖 class），改为鼠标离开时把光斑圆心移到画布外。
 */
import { computed, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    class?: string
    slotClass?: string
    gradientSize?: number
    gradientColor?: string
    gradientOpacity?: number
  }>(),
  {
    class: '',
    slotClass: '',
    gradientSize: 200,
    gradientColor: '#262626',
    gradientOpacity: 1
  }
)

const mouseX = ref(-props.gradientSize * 10)
const mouseY = ref(-props.gradientSize * 10)

function handleMouseMove(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  mouseX.value = e.clientX - rect.left
  mouseY.value = e.clientY - rect.top
}

/** 移出时把圆心挪到画布外，光斑自然消失，不做透明度过渡 */
function handleMouseLeave() {
  mouseX.value = -props.gradientSize * 10
  mouseY.value = -props.gradientSize * 10
}

onMounted(() => {
  mouseX.value = -props.gradientSize * 10
  mouseY.value = -props.gradientSize * 10
})

const backgroundStyle = computed(() => {
  return `radial-gradient(
    circle ${props.gradientSize}px at ${mouseX.value}px ${mouseY.value}px,
    ${props.gradientColor} 0%,
    rgba(0, 0, 0, 0) 70%
  )`
})
</script>

<template>
  <div
    :class="cn('group relative overflow-hidden rounded-xl', props.class)"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div :class="cn('relative z-10 h-full w-full', props.slotClass)">
      <slot />
    </div>
    <div
      class="pointer-events-none absolute inset-0 rounded-xl"
      :style="{ background: backgroundStyle, opacity: gradientOpacity }"
    />
  </div>
</template>
