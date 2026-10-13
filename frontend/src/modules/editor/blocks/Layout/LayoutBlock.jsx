// frontend/src/modules/editor/blocks/Layout/LayoutBlock.jsx
import React, { useRef, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import { DND_TYPE_NEW_BLOCK } from '../../ui/DraggableBlockItem';
import { useBlockRenderer, useEditableBlock } from '../../core/blockComponents';
import { BASE_URL } from '../../../../shared/config';
import { Plus } from 'lucide-react';

const DRAG_ITEM_TYPE_EXISTING = 'BLOCK';
const getGridClasses = (direction = 'row', preset, verticalAlign = 'top') => {
    const verticalAlignMap = {
        top: 'items-start',
        middle: 'items-center',
        bottom: 'items-end',
        stretch: 'items-stretch'
    };
    const alignClass = verticalAlignMap[verticalAlign] || 'items-start';
    if (direction === 'column') {
        return `grid grid-cols-1 ${alignClass}`;
    }
    let colsClass = 'grid-cols-1 @3xl:grid-cols-2';
    switch (preset) {
        case '50-50': colsClass = 'grid-cols-1 @3xl:grid-cols-2'; break;
        case '75-25': colsClass = 'grid-cols-1 @3xl:grid-cols-[3fr_1fr]'; break;
        case '25-75': colsClass = 'grid-cols-1 @3xl:grid-cols-[1fr_3fr]'; break;
        case '33-33-33': colsClass = 'grid-cols-1 @3xl:grid-cols-3'; break;
        case '25-25-25-25': colsClass = 'grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4'; break; 
        default: colsClass = 'grid-cols-1 @3xl:grid-cols-2';
    }
    return `grid w-full ${colsClass} ${alignClass}`;
};

const ColumnDropZone = ({ children, onDrop, path, isEditorPreview, onAddBlock, viewMode = 'editor' }) => {
    const isActuallyEditing = isEditorPreview && viewMode === 'editor';
    const [{ isOver, canDrop }, drop] = useDrop({
        accept: [DRAG_ITEM_TYPE_EXISTING, DND_TYPE_NEW_BLOCK],
        drop: (item, monitor) => {
            if (monitor.didDrop()) return;
            const dragType = monitor.getItemType();
            if (dragType === DRAG_ITEM_TYPE_EXISTING) {
                const dragPath = item.path;
                const dropZonePath = path;
                const isDroppingOnSelf = dropZonePath.join(',').startsWith(dragPath.join(',')) &&
                                         dropZonePath.length > dragPath.length;
                if (isDroppingOnSelf) return;
                onDrop(item, path);
            } else if (dragType === DND_TYPE_NEW_BLOCK) {
                const newBlockPath = [...path, React.Children.count(children)];
                onAddBlock(newBlockPath, item.blockType, item.presetData);
            }
            return { name: 'ColumnDropZone', path };
        },
        canDrop: () => isActuallyEditing,
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    });

    const isActive = isOver && canDrop;
    return (
        <div 
            ref={drop} 
            className={`
                layout-drop-zone
                min-h-25 p-2.5 rounded-lg w-full box-border flex flex-col relative transition-colors duration-200
                ${isActive ? 'border-2 border-dashed border-(--platform-accent) bg-blue-500/5' : `border border-dashed ${isActuallyEditing ? 'border-(--platform-border-color)' : 'border-transparent'}`}
            `}
        >
            <div className="flex-1 w-full flex flex-col">
                {children}
                {isActuallyEditing && React.Children.count(children) === 0 && (
                    <div className="layout-empty-placeholder flex flex-col items-center justify-center h-25 text-(--platform-text-secondary) opacity-60 pointer-events-none">
                        <div className="w-8 h-8 rounded-full border border-(--platform-border-color) flex items-center justify-center mb-1.5 bg-(--platform-bg)">
                            <Plus size={16} />
                        </div>
                        <span className="text-xs">Сюди блок</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const LayoutBlock = ({ 
    block, 
    siteData, 
    isEditorPreview, 
    path = [], 
    viewMode = 'editor',
    onMoveBlock, 
    onDropBlock, 
    onDeleteBlock, 
    onSelectBlock, 
    selectedBlockPath,
    onAddBlock 
}) => {
    const { 
        preset, 
        columns = [], 
        direction = 'row', 
        verticalAlign = 'top', 
        gap = 20,
        height = 'auto', 
        styles = {},
        minHeight: legacyMinHeight,
        padding: legacyPadding = '20px',
        bg_type = 'none', 
        bg_color = 'transparent',
        bg_image,
        bg_video,
        overlay_color = '#000000',
        overlay_opacity = 0
    } = block.data;
    const BlockRenderer = useBlockRenderer();
    const EditableBlockWrapper = useEditableBlock();
    const videoRef = useRef(null);
    const heightClasses = { 
        small: 'min-h-[300px]',
        medium: 'min-h-[500px]',
        large: 'min-h-[700px]',
        full: 'min-h-[calc(100vh-60px)]',
        auto: 'min-h-auto'
    };
    const activeMinHeightClass = heightClasses[height] || (legacyMinHeight === 'screen' ? 'min-h-screen' : '') || 'min-h-auto';
    const activeMinHeightStyle = (!heightClasses[height] && legacyMinHeight !== 'screen' && legacyMinHeight) ? { minHeight: legacyMinHeight } : {};
    const fullImageUrl = bg_image 
        ? (bg_image.startsWith('http') ? bg_image : `${BASE_URL}${bg_image}`)
        : null;
    const fullVideoUrl = bg_video 
        ? (bg_video.startsWith('http') ? bg_video : `${BASE_URL}${bg_video}`)
        : null;
    useEffect(() => {
        if (videoRef.current && bg_type === 'video') {
            videoRef.current.play().catch(e => console.error("Autoplay failed", e));
        }
    }, [bg_type, fullVideoUrl]);
    const alignmentClass = activeMinHeightClass !== 'min-h-auto' 
        ? (verticalAlign === 'middle' ? 'justify-center' : (verticalAlign === 'bottom' ? 'justify-end' : 'justify-start'))
        : 'justify-start';
        
    const isActuallyEditing = isEditorPreview && viewMode === 'editor';
    const safePadding = legacyPadding === '20px' ? undefined : legacyPadding;
    return (
        <div 
            className={`
                relative flex flex-col overflow-hidden w-full
                ${safePadding === undefined ? 'px-4 py-8 @3xl:p-8' : ''}
                ${activeMinHeightClass}
                ${alignmentClass}
            `}
            style={{
                padding: safePadding,
                ...styles, 
                ...activeMinHeightStyle,
                backgroundColor: bg_type === 'color' ? bg_color : 'var(--site-bg, #f7fafc)',
            }}
            id={block.data.anchorId}
        >
            {bg_type === 'image' && fullImageUrl && (
                 <div 
                    className="absolute inset-0 z-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${fullImageUrl})` }} 
                />
            )}
            {bg_type === 'video' && fullVideoUrl && (
                <video
                    ref={videoRef}
                    src={fullVideoUrl}
                    poster={fullImageUrl}
                    autoPlay muted loop playsInline
                    className="absolute inset-0 w-full h-full object-cover z-0"
                />
            )}
            {(bg_type === 'image' || bg_type === 'video') && (
                <div
                    className="absolute inset-0 z-1"
                    style={{
                        backgroundColor: overlay_color,
                        opacity: parseFloat(overlay_opacity) || 0
                    }} 
                />
            )}
            <div 
                className={`
                    relative z-2 w-full max-w-300 mx-auto
                    ${getGridClasses(direction, preset, verticalAlign)}
                `}
                style={{ gap: `${gap}px` }}
            >
                {columns.map((columnBlocks, colIndex) => {
                    const safePath = path || [];
                    const columnPath = [...safePath, 'data', 'columns', colIndex];
                    if (!isActuallyEditing) {
                        return (
                            <div key={colIndex} className="min-w-0 w-full flex flex-col h-full">
                                <BlockRenderer
                                    blocks={columnBlocks}
                                    siteData={siteData}
                                    isEditorPreview={false}
                                    isLayoutColumn={true}
                                    emptyTitle="Блок порожнійі"
                                    emptyDescription="Додайте блок"
                                />
                            </div>
                        );
                    }
                    return (
                        <ColumnDropZone
                            key={colIndex}
                            isEditorPreview={isEditorPreview}
                            viewMode={viewMode}
                            path={columnPath}
                            onDrop={onDropBlock}
                            onAddBlock={onAddBlock}
                        >
                            {columnBlocks.map((childBlock, childIndex) => (
                                <EditableBlockWrapper
                                    key={childBlock.block_id}
                                    block={childBlock}
                                    siteData={siteData}
                                    path={[...columnPath, childIndex]}
                                    viewMode={viewMode}
                                    onMoveBlock={onMoveBlock}
                                    onDropBlock={onDropBlock}
                                    onDeleteBlock={onDeleteBlock}
                                    onAddBlock={onAddBlock}
                                    onSelectBlock={onSelectBlock}
                                    selectedBlockPath={selectedBlockPath}
                                />
                            ))}
                        </ColumnDropZone>
                    );
                })}
            </div>
        </div>
    );
};

function layoutPropsAreEqual(prev, next) {
    if (prev.block !== next.block) return false;
    if (prev.viewMode !== next.viewMode) return false;
    if (prev.siteData !== next.siteData) return false;
    if (prev.isEditorPreview !== next.isEditorPreview) return false;
    if (prev.path?.join(',') !== next.path?.join(',')) return false;
    if (prev.selectedBlockPath?.join(',') !== next.selectedBlockPath?.join(',')) return false;
    return true;
}

export default React.memo(LayoutBlock, layoutPropsAreEqual);