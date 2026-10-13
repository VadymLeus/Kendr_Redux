// frontend/src/modules/editor/core/BlockEditor.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import EditableBlockWrapper from '../ui/EditableBlockWrapper';
import { DND_TYPE_NEW_BLOCK } from '../ui/DraggableBlockItem';
import { DND_TYPE_EXISTING } from './useBlockDrop';
import ContextMenu from '../ui/ContextMenu';
import { findBlockByPath } from './blockUtils';
import { isHeaderType } from './globalBlockTypes';
import { useConfirm } from '../../../shared/hooks/useConfirm';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageOpen, ArrowDownToLine, Layers } from 'lucide-react';

const useDragAutoScroll = (ref, isEnabled) => {
    useEffect(() => {
        const container = ref.current;
        if (!container || !isEnabled) return;
        let animationFrameId;
        let currentSpeed = 0;
        const animateScroll = () => {
            if (currentSpeed !== 0) {
                container.scrollTop += currentSpeed;
            }
            animationFrameId = requestAnimationFrame(animateScroll);
        };
        animationFrameId = requestAnimationFrame(animateScroll);
        const onDragOver = (e) => {
            const { clientY, clientX } = e;
            const rect = container.getBoundingClientRect();
            if (clientX < rect.left || clientX > rect.right) {
                currentSpeed = 0;
                return;
            }
            const topDist = clientY - rect.top;
            const bottomDist = rect.bottom - clientY;
            const threshold = 150; 
            const maxSpeed = 20;
            if (topDist >= 0 && topDist < threshold) {
                currentSpeed = -maxSpeed * (1 - topDist / threshold);
            } else if (bottomDist >= 0 && bottomDist < threshold) {
                currentSpeed = maxSpeed * (1 - bottomDist / threshold);
            } else {
                currentSpeed = 0;
            }
        };
        const stopScrolling = () => { currentSpeed = 0; };
        document.addEventListener('dragover', onDragOver, true);
        document.addEventListener('dragend', stopScrolling, true);
        document.addEventListener('drop', stopScrolling, true);
        return () => {
            cancelAnimationFrame(animationFrameId);
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('dragend', stopScrolling, true);
            document.removeEventListener('drop', stopScrolling, true);
        };
    }, [ref, isEnabled]);
};

const BlockEditor = ({
    blocks,
    siteData,
    onAddBlock,
    onMoveBlock,
    onDropBlock,
    onDeleteBlock,
    onSelectBlock,
    selectedBlockPath,
    collapsedBlocks,
    onToggleCollapse,
    onBlockSaved,
    isHeaderMode,
    viewMode = 'editor'
}) => {
    const { confirm } = useConfirm();
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, path: null, blockId: null });
    const mobileScrollRef = useRef(null);
    useDragAutoScroll(mobileScrollRef, true);
    const [{ isOverBottom }, bottomDropRef] = useDrop(() => ({
        accept: [DND_TYPE_NEW_BLOCK, DND_TYPE_EXISTING],
        collect: (monitor) => ({ isOverBottom: monitor.isOver({ shallow: true }) }),
        drop: (item, monitor) => {
            if (monitor.didDrop()) return;
            const dragType = monitor.getItemType();
            if (dragType === DND_TYPE_NEW_BLOCK) {
                onAddBlock([blocks.length], item.blockType, item.presetData);
            } else if (dragType === DND_TYPE_EXISTING) {
                const dragPath = item.path;
                const targetPath = [blocks.length]; 
                const isLastBlock = dragPath.length === 1 && dragPath[0] === blocks.length - 1;
                if (!isLastBlock) onMoveBlock(dragPath, targetPath);
            }
        },
    }), [blocks.length, onAddBlock, onMoveBlock]);
    
    const [{ isOverEmpty }, emptyDropRef] = useDrop(() => ({
        accept: [DND_TYPE_NEW_BLOCK],
        collect: (monitor) => ({ isOverEmpty: monitor.isOver({ shallow: true }) }),
        drop: (item, monitor) => {
            if (monitor.didDrop()) return;
            onAddBlock([blocks.length], item.blockType, item.presetData); 
        },
    }), [blocks.length, onAddBlock]);
    const handleContextMenu = (e, path, blockId) => {
        if (viewMode !== 'editor') return; 
        e.preventDefault(); e.stopPropagation();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, path: path, blockId: blockId });
    };
    
    const handleCloseContextMenu = () => setContextMenu(prev => ({ ...prev, visible: false }));
    const handleContextMenuAction = async (action) => {
        const { path } = contextMenu;
        if (!path) return;
        handleCloseContextMenu();
        switch (action) {
            case 'edit': onSelectBlock(path); break;
            case 'duplicate':
                const blockToClone = findBlockByPath(blocks, path);
                if (blockToClone) {
                    const parentPath = path.slice(0, -1);
                    const currentIndex = path[path.length - 1];
                    const newPath = [...parentPath, currentIndex + 1];
                    onAddBlock(newPath, blockToClone.type, { isSavedBlock: true, content: blockToClone.data });
                }
                break;
            case 'delete':
                const isConfirmed = await confirm({ title: "Видалити блок?", message: "Ви впевнені, що хочете видалити цей блок?", type: "danger", confirmLabel: "Видалити" });
                if (isConfirmed) onDeleteBlock(path);
                break;
            case 'moveUp':
                if (path[path.length - 1] > 0) onMoveBlock(path, [...path.slice(0, -1), path[path.length - 1] - 1]);
                break;
            case 'moveDown':
                onMoveBlock(path, [...path.slice(0, -1), path[path.length - 1] + 1]);
                break;
            default: break;
        }
    };
    let containerClass = '@container flex flex-col flex-1 h-full overflow-hidden';
    const isEmptyPreview = blocks.length === 0 && viewMode !== 'editor';
    let scrollbarClass = '';
    if (viewMode === 'mobile') {
        scrollbarClass = 'px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]';
    } else if (viewMode === 'desktop') {
        scrollbarClass = 'px-0 site-scrollbar';
    } else {
        scrollbarClass = 'px-8';
    }

    const blocksContainerClass = `blocks-container w-full flex-1 overflow-y-auto ${scrollbarClass} ${isEmptyPreview ? 'flex flex-col' : 'flow-root'}`;
    return (
        <div className={containerClass}>
            {blocks.length === 0 && viewMode === 'editor' ? (
                <div className="flex flex-col items-center justify-center w-full h-full p-4">
                    <div 
                        ref={viewMode === 'editor' ? emptyDropRef : null} 
                        className={`flex flex-col items-center justify-center w-full max-w-4xl p-16 text-center border-4 border-dashed rounded-[2.5rem] transition-all duration-300 cursor-pointer h-full min-h-100 ${isOverEmpty ? 'border-(--platform-accent) bg-black/5 text-(--platform-accent) scale-[1.02] shadow-xl' : 'border-(--platform-border-color) bg-transparent text-(--platform-text-secondary) hover:border-(--platform-accent) hover:text-(--platform-accent)'}`}
                    >
                        <div className={`mb-6 transition-transform duration-300 ${isOverEmpty ? 'scale-110 animate-pulse' : ''}`}><PackageOpen size={80} strokeWidth={1.5} /></div>
                        <h3 className="mb-4 text-3xl font-bold tracking-tight">{isOverEmpty ? 'Відпустіть блок тут!' : 'Початок роботи'}</h3>
                        <p className="m-0 text-lg opacity-80 max-w-md mx-auto leading-relaxed">Перетягніть ваш перший блок з бібліотеки праворуч</p>
                    </div>
                </div>
            ) : (
                <div className="w-full flex-1 p-0 relative bg-transparent flex flex-col min-h-0">
                    <div ref={mobileScrollRef} className={blocksContainerClass}>
                        {isEmptyPreview ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 w-full bg-transparent text-center min-h-[60vh]">
                                <div className="mb-6 opacity-40">
                                    <Layers size={64} style={{ color: 'var(--site-text-primary)' }} />
                                </div>
                                <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--site-text-primary)' }}>Сторінка порожня</h1>
                                <p className="max-w-md mx-auto text-[1.05rem]" style={{ color: 'var(--site-text-secondary)' }}>
                                    Поверніться у режим редактора, щоб додати блоки.
                                </p>
                            </div>
                        ) : (
                            <AnimatePresence initial={false}>
                                {blocks.map((block, index) => {
                                    const isHeader = isHeaderType(block.type);
                                    const isSticky = isHeader && block.data?.is_sticky && viewMode !== 'editor';
                                    return (
                                        <motion.div 
                                            key={block.block_id} 
                                            className={isSticky ? 'sticky top-0 z-85' : 'relative'}
                                            initial={{ opacity: 0, y: -30, scale: 0.98 }} 
                                            animate={{ opacity: 1, y: 0, scale: 1 }} 
                                            exit={{ opacity: 0, height: 0, overflow: 'hidden' }} 
                                            transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
                                        >
                                            <EditableBlockWrapper
                                                index={index}
                                                block={block}
                                                siteData={siteData}
                                                path={[index]}
                                                isLastRootBlock={index === blocks.length - 1}
                                                onMoveBlock={onMoveBlock}
                                                onDropBlock={onDropBlock}
                                                onDeleteBlock={onDeleteBlock}
                                                onAddBlock={onAddBlock}
                                                onSelectBlock={onSelectBlock}
                                                selectedBlockPath={selectedBlockPath}
                                                isCollapsed={collapsedBlocks.includes(block.block_id)}
                                                onToggleCollapse={onToggleCollapse}
                                                onBlockSaved={onBlockSaved}
                                                onContextMenu={handleContextMenu}
                                                viewMode={viewMode}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                        {blocks.length > 0 && !isHeaderMode && viewMode === 'editor' && (
                            <div ref={bottomDropRef} className="w-full relative z-1 pt-6 pb-[30vh] flex flex-col cursor-pointer">
                                <div className={`
                                    w-full h-32 shrink-0 rounded-2xl border-2 border-dashed transition-all duration-300 flex items-center justify-center
                                    ${isOverBottom 
                                        ? 'border-(--platform-accent) bg-(--platform-accent)/10 scale-[1.01] shadow-sm' 
                                        : 'border-(--platform-border-color) hover:border-(--platform-accent)/40 bg-transparent'}
                                `}>
                                    <div className={`transition-all duration-300 flex items-center gap-2 font-medium ${isOverBottom ? 'text-(--platform-accent) scale-110 opacity-100' : 'text-(--platform-text-secondary) opacity-60'}`}>
                                        <ArrowDownToLine size={20} />
                                        <span>Додати в кінець сторінки</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <ContextMenu visible={contextMenu.visible} x={contextMenu.x} y={contextMenu.y} onClose={handleCloseContextMenu} onAction={handleContextMenuAction} />
        </div>
    );
};

export default BlockEditor;