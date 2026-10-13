// frontend/src/modules/editor/blocks/Video/VideoBlock.jsx
import React, { useRef, useEffect } from 'react';
import { BASE_URL } from '../../../../shared/config';
import { Video as VideoIcon } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const getYoutubeVideoId = (url) => {
    if (!url || typeof url !== 'string') return null;
    const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
};

const VideoBlock = ({ blockData, isEditorPreview, style }) => {
    const { 
        url, 
        poster,
        height = 'medium', 
        overlay_color = '#000000',
        overlay_opacity,
        block_theme = 'auto',
        autoplay = true,
        muted = true,
        loop = true,
        controls = false,
        styles = {}
    } = blockData;
    
    const videoRef = useRef(null);
    const safeOpacity = (overlay_opacity === undefined || isNaN(Number(overlay_opacity))) 
        ? 0.5 
        : Number(overlay_opacity);
    const fullVideoUrl = url 
        ? (url.startsWith('http') ? url : `${BASE_URL}${url}`) 
        : null;
    const fullPosterUrl = poster 
        ? (poster.startsWith('http') ? poster : `${BASE_URL}${poster}`) 
        : null;
    const ytVideoId = getYoutubeVideoId(fullVideoUrl);
    useEffect(() => {
        if (ytVideoId) return; 
        const video = videoRef.current;
        if (!video) return;
        if (!controls && autoplay) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    if (muted) {
                        video.muted = true;
                        video.play().catch(e => console.error(e));
                    }
                });
            }
        }
    }, [controls, autoplay, muted, fullVideoUrl, ytVideoId]);
    const heightClasses = { 
        small: 'min-h-[250px] @3xl:min-h-[300px]', 
        medium: 'min-h-[300px] @3xl:min-h-[500px]', 
        large: 'min-h-[400px] @3xl:min-h-[700px]', 
        full: 'min-h-[calc(100vh-60px)]',
        auto: 'aspect-video w-full' 
    };
    
    const currentHeightClass = heightClasses[height] || heightClasses.medium;
    const isTransparent = overlay_color === 'transparent';
    const Placeholder = () => (
        <div className="absolute inset-0 w-full h-full p-8 @3xl:p-12 text-center bg-(--site-card-bg) border border-dashed border-(--site-border-color) text-(--site-text-secondary) flex flex-col items-center justify-center gap-3 box-border">
            <div className="opacity-40 text-(--site-text-primary)">
                <VideoIcon size={48} className="@3xl:w-16 @3xl:h-16" />
            </div>
            <div className="text-sm @3xl:text-base font-medium">
                Відео не вибрано
            </div>
        </div>
    );
    
    const renderContent = () => {
        if (ytVideoId) {
            const ytParams = new URLSearchParams({
                autoplay: autoplay ? '1' : '0',
                mute: muted ? '1' : '0',
                controls: controls ? '1' : '0',
                loop: loop ? '1' : '0',
                playlist: ytVideoId,
                playsinline: '1',
                rel: '0'
            });
            return (
                <div className={`absolute inset-0 w-full h-full overflow-hidden ${!controls ? 'pointer-events-none' : ''}`}>
                    <iframe
                        src={`https://www.youtube.com/embed/${ytVideoId}?${ytParams.toString()}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                        style={{
                            transform: !controls ? 'scale(1.25)' : 'none'
                        }}
                    />
                </div>
            );
        }
        if (fullVideoUrl) {
            return (
                <video
                    ref={videoRef}
                    src={fullVideoUrl}
                    poster={fullPosterUrl}
                    autoPlay={autoplay}
                    muted={muted}
                    loop={loop}
                    controls={controls}
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover block"
                />
            );
        }
        if (fullPosterUrl) {
            return (
                <img 
                    src={fullPosterUrl}
                    alt="Video poster"
                    className="absolute inset-0 w-full h-full object-cover block"
                />
            );
        }
        if (isEditorPreview) {
            return <Placeholder />;
        }
        return <div className="absolute inset-0 w-full h-full bg-black/10"></div>;
    };

    return (
        <div 
            className={`
                block-theme-${block_theme} relative w-full overflow-hidden
                ${currentHeightClass}
            `}
            style={{
                backgroundColor: 'var(--site-bg)',
                ...styles,
                ...style 
            }}
        >
            {renderContent()}
            {(fullVideoUrl || fullPosterUrl || ytVideoId) && !isTransparent && (
                <div 
                    className="absolute inset-0 z-10 pointer-events-none transition-all duration-300"
                    style={{
                        backgroundColor: overlay_color,
                        opacity: safeOpacity,
                    }}
                ></div>
            )}
        </div>
    );
};

export default React.memo(VideoBlock, areBlockPropsEqual);