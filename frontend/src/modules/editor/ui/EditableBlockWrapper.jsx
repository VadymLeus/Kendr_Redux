// frontend/src/modules/editor/ui/EditableBlockWrapper.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import BlockRenderer from '../core/BlockRenderer';
import apiClient from '../../../shared/api/api';
import SaveBlockModal from './modals/SaveBlockModal';
import { toast } from 'react-toastify';
import { useConfirm } from '../../../shared/hooks/useConfirm';
import { useBlockDrop, DND_TYPE_EXISTING } from '../core/useBlockDrop';
import { BLOCK_LIBRARY } from '../core/blockRegistry';
import { Settings, Trash2, Save, GripVertical, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

const EditableBlockWrapper = ({ 
    block, 
    siteData, 
    path,
    isLastRootBlock = false,
    onMoveBlock, 
    onDropBlock, 
    onDeleteBlock, 
    onAddBlock,
    onSelectBlock,
    selectedBlockPath,
    isCollapsed,
    onToggleCollapse,
    onBlockSaved,
    onContextMenu,
    viewMode = 'editor'
}) => {
    const ref = useRef(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const { confirm } = useConfirm();
    const isEditorMode = viewMode === 'editor';
    const isGlobal = block.type.startsWith('global-');
    const isHeader = block.type === 'global-header' || block.type === 'header';
    const isSticky = isHeader && block.data?.is_sticky && !isEditorMode;
    const [{ isDragging }, drag, preview] = useDrag({
        type: DND_TYPE_EXISTING,
        item: () => {
            return { path, type: DND_TYPE_EXISTING, id: block.block_id };
        },
        canDrag: isEditorMode,
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    });

    const [isVisualDragging, setIsVisualDragging] = useState(false);
    useEffect(() => {
        if (isDragging) {
            const timer = setTimeout(() => setIsVisualDragging(true), 15);
            return () => clearTimeout(timer);
        } else {
            setIsVisualDragging(false);
        }
    }, [isDragging]);

    const { drop, dropPosition, handlerId } = useBlockDrop({
        ref,
        path,
        onMoveBlock,
        onAddBlock,
        isLastRootBlock
    });

    if (isEditorMode) {
        drag(drop(ref));
        preview(ref); 
    } else {
        ref.current = null;
    }

    const showDropIndicator = isEditorMode && dropPosition;
    const shouldShowTopLine = showDropIndicator && dropPosition === 'top';
    const shouldShowBottomLine = showDropIndicator && dropPosition === 'bottom' && !isLastRootBlock;
    const blockDef = BLOCK_LIBRARY.find(b => b.type === block.type);
    const blockName = blockDef ? blockDef.name : block.type;
    const blockIcon = blockDef ? React.cloneElement(blockDef.icon, { size: 16 }) : <HelpCircle size={16} />;
    const blockDomId = `block-${block.block_id}`;
    const isSelected = isEditorMode && selectedBlockPath && Array.isArray(selectedBlockPath) && Array.isArray(path) && selectedBlockPath.join(',') === path.join(',');
    const handleSelect = (e) => {
        if (!isEditorMode) return;
        e.stopPropagation();
        onSelectBlock(path);
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        const msg = isGlobal 
            ? "Видалити глобальний блок з цієї сторінки? (Він залишиться в базі і його можна буде додати знову)."
            : "Ви впевнені, що хочете видалити цей блок? Цю дію не можна буде скасувати.";
        const isConfirmed = await confirm({
            title: isGlobal ? "Видалення глобального блоку" : "Видалення блоку",
            message: msg,
            type: "danger",
            confirmLabel: "Видалити"
        });
        if (isConfirmed) {
            onDeleteBlock(path);
            toast.info("Блок видалено");
        }
    };

    const handleSaveBlock = async (name, mode, targetOverrideId = null) => {
        try {
            const targetId = targetOverrideId || block._library_origin_id;
            if (mode === 'overwrite' && targetId) {
                 await apiClient.put(`/saved-blocks/${targetId}`, { content: block.data });
                toast.success(`Блок успішно оновлено в бібліотеці!`);
            } else {
                await apiClient.post('/saved-blocks', {
                    name: name,
                    type: block.type,
                    content: block.data
                });
                toast.success('Блок успішно збережено в бібліотеку!');
            }
            if (onBlockSaved) onBlockSaved();
        } catch (error) {
            console.error(error);
            toast.error('Помилка при збереженні');
        }
    };

    const originBlockInfo = block._library_origin_id ? { id: block._library_origin_id, name: block._library_name } : null;
    const baseBtnClass = `
        bg-transparent border border-(--platform-border-color) text-(--platform-text-secondary)
        p-1.5 lg:py-1.5 lg:px-2.5 rounded-md cursor-pointer flex items-center justify-center
        transition-all duration-200 text-xs font-medium gap-1.5
        hover:-translate-y-px hover:shadow-sm
    `;
    
    const getBtnHoverClass = (type) => {
        if (type === 'danger') return 'hover:bg-(--platform-danger) hover:text-white hover:border-(--platform-danger)';
        if (type === 'primary') return 'hover:bg-(--platform-accent) hover:text-(--platform-accent-text) hover:border-(--platform-accent)';
        return 'hover:bg-(--platform-hover-bg) hover:text-(--platform-text-primary) hover:border-(--platform-accent)';
    };

    const gapSize = '3px';
    let borderClass = 'hidden';
    if (isEditorMode) {
        if (isSelected) {
            borderClass = isGlobal ? 'block border-3 border-solid border-indigo-500' : 'block border-3 border-solid border-(--platform-accent)';
        } else if (isHovered) {
            borderClass = isGlobal ? 'block border-3 border-dashed border-indigo-500' : 'block border-3 border-dashed border-(--platform-accent)';
        }
    }

    const dropZoneClass = (isEditorMode && !isSticky) ? 'py-3' : 'py-0';
    return (
        <div 
            ref={isEditorMode ? ref : null}
            className={`w-full ${dropZoneClass} ${isSticky ? 'sticky top-0 z-50' : 'relative'}`}
            data-handler-id={handlerId}
        >
            {shouldShowTopLine && (
                <div className="absolute left-0 right-0 h-1 bg-(--platform-accent) z-100 rounded-sm pointer-events-none shadow-md -top-0.5" />
            )}
            <div
                id={blockDomId}
                onClick={handleSelect}
                onContextMenu={(e) => onContextMenu && onContextMenu(e, path, block.block_id)}
                className={`relative transition-colors duration-200 outline-none group w-full ${!isSticky ? (isSelected ? 'z-10' : (isHovered ? 'z-5' : 'z-1')) : ''}`}
                onMouseEnter={() => isEditorMode && setIsHovered(true)}
                onMouseLeave={() => isEditorMode && setIsHovered(false)}
            >
                {isVisualDragging && (
                    <div className={`
                        absolute top-0 left-0 right-0 bottom-0 z-20 flex items-center justify-center rounded-lg
                        border-3 border-dashed transition-colors duration-200 pointer-events-none
                        ${showDropIndicator && dropPosition === 'center' 
                            ? 'border-(--platform-accent) bg-black/5 dark:bg-white/5' 
                            : 'border-(--platform-border-color)'}
                    `}>
                        <div className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm font-bold transition-colors duration-200
                            ${showDropIndicator && dropPosition === 'center' 
                                ? 'bg-(--platform-accent) text-white border-transparent' 
                                : 'bg-(--platform-card-bg) border border-(--platform-border-color) text-(--platform-text-primary)'}
                        `}>
                            <span className={showDropIndicator && dropPosition === 'center' ? 'text-white' : (isGlobal ? 'text-indigo-500' : 'text-(--platform-accent)')}>
                                {blockIcon}
                            </span>
                            <span>Блок: {blockName}</span>
                        </div>
                    </div>
                )}
                <div className={`transition-opacity duration-300 ${isVisualDragging ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {isEditorMode && (
                        <div className={`absolute rounded-xl pointer-events-none z-2 transition-colors duration-200 ${borderClass}`}
                            style={{ top: `-${gapSize}`, left: `-${gapSize}`, right: `-${gapSize}`, bottom: `-${gapSize}` }} 
                        />
                    )}
                    <div className={`relative z-3 ${isEditorMode ? 'rounded-lg overflow-hidden bg-transparent isolate shadow-sm border border-(--platform-border-color)' : 'border-none'}`}>
                        {isEditorMode && (
                            <div className="flex justify-between items-center px-3 py-2 bg-(--platform-card-bg) border-b border-(--platform-border-color) gap-2.5 cursor-grab">
                                <span className="text-sm font-medium text-(--platform-text-primary) flex items-center gap-2 flex-1 overflow-hidden whitespace-nowrap text-ellipsis" title={blockName}>
                                    <span className="flex items-center text-(--platform-text-secondary)"><GripVertical size={16} /></span>
                                    <span className={`flex items-center ${isGlobal ? 'text-indigo-500' : 'text-(--platform-accent)'}`}>{blockIcon}</span>
                                    <span className={isGlobal ? 'text-indigo-500 font-bold' : ''}>{blockName}</span>
                                </span>
                                <div className="flex gap-1 cursor-default" onClick={e => e.stopPropagation()}>
                                    {!isGlobal && (
                                        <button onClick={(e) => { e.stopPropagation(); setIsSaveModalOpen(true); }} className={`${baseBtnClass} ${getBtnHoverClass('default')}`} title="Зберегти"><Save size={16} /></button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(block.block_id); }} className={`${baseBtnClass} ${getBtnHoverClass('default')}`} title={isCollapsed ? 'Розгорнути' : 'Згорнути'}>
                                        {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                    </button>
                                    <button onClick={handleSelect} className={`${baseBtnClass} ${getBtnHoverClass('primary')}`} title="Налаштування">
                                        <Settings size={16} /> <span className="hidden lg:inline">Налаштування</span>
                                    </button>
                                    <button onClick={handleDelete} title="Видалити" className={`${baseBtnClass} ${getBtnHoverClass('danger')}`}><Trash2 size={16} /></button>
                                </div>
                            </div>
                        )}
                        {isCollapsed && isEditorMode ? (
                            <div className="p-6 text-center bg-(--platform-bg) text-(--platform-text-secondary)"><small>Вміст блоку згорнуто</small></div>
                        ) : (
                            <div className="site-theme-context" data-site-mode={siteData?.site_theme_mode || 'light'} data-site-accent={siteData?.site_theme_accent || 'orange'} style={{ background: block.type === 'layout' ? 'transparent' : 'var(--site-bg)', color: 'var(--platform-text-primary)' }}>
                                <BlockRenderer blocks={[block]} siteData={siteData} isEditorPreview={true} path={path} onMoveBlock={onMoveBlock} onDropBlock={onDropBlock} onDeleteBlock={onDeleteBlock} onAddBlock={onAddBlock} onSelectBlock={onSelectBlock} selectedBlockPath={selectedBlockPath} viewMode={viewMode} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {isEditorMode && !isGlobal && (
                <SaveBlockModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={handleSaveBlock} originBlockInfo={originBlockInfo} />
            )}
            {shouldShowBottomLine && (
                <div className="absolute left-0 right-0 h-1 bg-(--platform-accent) z-100 rounded-sm pointer-events-none shadow-md -bottom-0.5" />
            )}
        </div>
    );
};

function arePropsEqual(prev, next) {
    if (prev.block !== next.block) return false;
    if (prev.isCollapsed !== next.isCollapsed) return false;
    if (prev.viewMode !== next.viewMode) return false;
    if (prev.siteData !== next.siteData) return false;
    if (prev.isLastRootBlock !== next.isLastRootBlock) return false;
    if (prev.path?.join(',') !== next.path?.join(',')) return false;
    if (prev.selectedBlockPath?.join(',') !== next.selectedBlockPath?.join(',')) return false;
    return true;
}

export default React.memo(EditableBlockWrapper, arePropsEqual);