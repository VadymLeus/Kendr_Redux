// frontend/src/modules/editor/ui/BlockLayerItem.jsx
import React, { useRef } from 'react';
import { useDrag } from 'react-dnd';
import { BLOCK_LIBRARY } from '../core/blockRegistry';
import { useBlockDrop, DND_TYPE_EXISTING } from '../core/useBlockDrop';
import { useConfirm } from '../../../shared/hooks/useConfirm';
import { toast } from 'react-toastify';
import { Settings, Trash2, PanelTop, HelpCircle, GripVertical } from 'lucide-react';

const BlockLayerItem = ({
    block,
    path,
    onMoveBlock,
    onSelectBlock,
    onDeleteBlock
}) => {
    const ref = useRef(null);
    const { confirm } = useConfirm();
    const blockInfo = BLOCK_LIBRARY.find(b => b.type === block.type) || { 
        name: block.type, 
        icon: <HelpCircle size={16} /> 
    };

    const isGlobal = block.type.startsWith('global-');
    const [{ isDragging }, drag] = useDrag({
        type: DND_TYPE_EXISTING,
        item: { path },
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    });

    const { drop, dropPosition } = useBlockDrop({
        ref,
        path,
        onMoveBlock,
    });

    drag(drop(ref));
    const showDropIndicator = dropPosition && !isDragging;
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

    const handleSelectAndScroll = (e) => {
        e.stopPropagation();
        onSelectBlock(path);
        const blockDomId = `block-${block.block_id}`;
        const element = document.getElementById(blockDomId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    };
    let nestedBlocks = null;
    if (block.type === 'layout' && block.data.columns) {
        nestedBlocks = (
            <div className="ml-5 pl-3 border-l-2 border-(--platform-border-color) mt-2">
                {block.data.columns.map((column, colIndex) => (
                    <div key={colIndex}>
                        <div className="p-2 italic text-(--platform-text-secondary) text-xs bg-(--platform-bg) rounded mb-1 flex items-center gap-2">
                            <div className="w-4 h-4 min-w-4 flex items-center justify-center shrink-0">
                                <PanelTop size={14} />
                            </div>
                            <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 leading-tight">
                                Колонка {colIndex + 1}
                            </span>
                            <small className="ml-auto opacity-70 whitespace-nowrap shrink-0">
                                {column.length} ел.
                            </small>
                        </div>
                        {column.map((colBlock, colBlockIndex) => (
                            <BlockLayerItem
                                key={colBlock.block_id}
                                block={colBlock}
                                path={[...path, 'data', 'columns', colIndex, colBlockIndex]}
                                onMoveBlock={onMoveBlock}
                                onSelectBlock={onSelectBlock}
                                onDeleteBlock={onDeleteBlock}
                            />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    const actionBtnClasses = "flex items-center justify-center w-6 h-6 min-w-6 shrink-0 border-none bg-transparent cursor-pointer rounded p-0 transition-all duration-200 text-(--platform-text-secondary)";
    return (
        <>
            <div
                ref={ref}
                onClick={handleSelectAndScroll}
                className={`
                    relative py-2.5 pr-1.5 pl-3 my-1 flex items-center gap-3 border rounded-lg cursor-grab transition-all duration-200 text-sm font-medium shadow-sm group
                    ${isDragging 
                        ? 'opacity-50 bg-(--platform-bg) border-(--platform-accent)' 
                        : 'bg-(--platform-card-bg) border-(--platform-border-color) hover:border-(--platform-accent)'}
                `}
            >
                {showDropIndicator && dropPosition === 'top' && (
                    <div className="absolute left-0 right-0 h-0.5 bg-(--platform-accent) z-10 pointer-events-none shadow-sm -top-0.5" />
                )}
                {showDropIndicator && dropPosition === 'bottom' && (
                    <div className="absolute left-0 right-0 h-0.5 bg-(--platform-accent) z-10 pointer-events-none shadow-sm -bottom-0.5" />
                )}
                <div className="flex items-center justify-center w-5 h-5 min-w-5 shrink-0 text-(--platform-text-secondary) cursor-grab mr-1">
                    <GripVertical size={14} />
                </div>
                <div className="flex items-center justify-center w-5 h-5 min-w-5 shrink-0 text-(--platform-accent) opacity-80">
                    {blockInfo.icon}
                </div>
                <div className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 leading-tight">
                    {blockInfo.name}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                    <button 
                        title="Налаштування" 
                        onClick={handleSelectAndScroll}
                        className={`${actionBtnClasses} hover:text-(--platform-accent) hover:bg-(--platform-bg)`}
                    >
                        <Settings size={14} />
                    </button>
                    <button 
                        title="Видалити" 
                        onClick={handleDelete} 
                        className={`${actionBtnClasses} hover:text-white hover:bg-(--platform-danger)`}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            {nestedBlocks}
        </>
    );
};

export default BlockLayerItem;