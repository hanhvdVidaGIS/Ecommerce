'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { SiteConfig } from '@/api/types'

type Banner = SiteConfig['banners'][number]

/** Slider banner chính. Tự chạy (tôn trọng prefers-reduced-motion), dừng khi rê chuột/focus; ảnh riêng cho điện thoại. */
export function HeroSlider({ banners, autoplay, intervalMs }: { banners: Banner[]; autoplay: boolean; intervalMs: number }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = banners.length

  useEffect(() => {
    if (!autoplay || paused || count < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(2000, intervalMs))
    return () => clearInterval(t)
  }, [autoplay, paused, count, intervalMs])

  if (count === 0) return null
  const go = (i: number) => setIndex((i + count) % count)

  return (
    <section aria-roledescription="carousel" aria-label="Banner nổi bật" className="relative overflow-hidden bg-subtle"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="flex transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((b, i) => (
          <div key={b.id} className="relative w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} aria-hidden={i !== index}>
            <picture>
              {b.mobileImage ? <source media="(max-width: 767px)" srcSet={b.mobileImage.url} width={b.mobileImage.width ?? undefined} height={b.mobileImage.height ?? undefined} /> : null}
              {b.desktopImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.desktopImage.url} alt={b.desktopImage.altText || b.title} width={b.desktopImage.width ?? undefined} height={b.desktopImage.height ?? undefined}
                  loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : undefined}
                  className="h-[26rem] w-full object-cover md:h-auto md:max-h-[34rem]" />
              ) : <div className="h-72 bg-subtle" />}
            </picture>
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/55 via-black/10 to-transparent md:items-center md:bg-gradient-to-r md:from-black/50 md:via-black/10">
              <div className="container-page pb-12 text-white md:pb-0">
                <h2 className="max-w-lg text-3xl font-bold leading-tight md:text-5xl">{b.title}</h2>
                {b.subtitle ? <p className="mt-3 max-w-md text-base text-white/90 md:text-lg">{b.subtitle}</p> : null}
                {b.buttonUrl && b.buttonText ? <Link href={b.buttonUrl} className="btn btn-accent mt-6" tabIndex={i === index ? 0 : -1}>{b.buttonText}</Link> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {count > 1 ? (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Banner trước" className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white md:block"><ChevronLeft size={22} /></button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Banner sau" className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white md:block"><ChevronRight size={22} /></button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {banners.map((b, i) => (
              <button key={b.id} type="button" onClick={() => go(i)} aria-label={`Chuyển tới banner ${i + 1}`} aria-current={i === index}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
