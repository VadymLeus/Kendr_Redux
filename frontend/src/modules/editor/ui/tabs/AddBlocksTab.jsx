// frontend/src/modules/editor/ui/tabs/AddBlocksTab.jsx
import React, { useState, useEffect } from 'react';
import DraggableBlockItem from '../DraggableBlockItem';
import { getBlocksByCategory } from '../../core/blockRegistry';
import apiClient from '../../../../shared/api/api';
import { useConfirm } from '../../../../shared/hooks/useConfirm';
import { Input } from '../../../../shared/ui/elements/Input';
import { toast } from 'react-toastify';
import { ChevronDown, ChevronRight, Trash2, Edit, Check, X, Package, PanelTop, Box, ShoppingBag, GripVertical, Globe, Loader2 } from 'lucide-react';

const Section = ({ title, children, defaultOpen = false, icon }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className={`border-b border-(--platform-border-color) ${isOpen ? 'mb-4' : 'mb-0'}`}>
            <div 
                className={`
                    flex items-center justify-between py-3 cursor-pointer select-none
                    ${isOpen ? 'text-(--platform-text-primary)' : 'text-(--platform-text-secondary)'}
                    transition-colors duration-200
                `}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2.5 font-semibold text-sm">
                    {icon && <span className="text-(--platform-accent)">{icon}</span>}
                    {title}
                </div>
                <div className="text-(--platform-text-secondary)">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
            </div>
            
            {isOpen && (
                <div className="animate-in slide-in-from-top-1 duration-200 pb-4">
                    {children}
                </div>
            )}
        </div>
    );
};

const SavedBlockItem = ({ block, onDelete, onRename, onClickAdd }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(block.name);
    const [isSaving, setIsSaving] = useState(false);
    const handleStartEdit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setNewName(block.name);
        setIsEditing(true);
    };

    const handleCancelEdit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(false);
        setNewName(block.name);
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!newName.trim() || newName === block.name) {
            setIsEditing(false);
            return;
        }
        setIsSaving(true);
        await onRename(block.id, newName);
        setIsSaving(false);
        setIsEditing(false);
    };

    const handleDeleteClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete(e, block.id, block.name);
    };

    const actionBtnClasses = "w-7 h-7 flex items-center justify-center border-none bg-transparent cursor-pointer text-(--platform-text-secondary) rounded hover:bg-(--platform-hover-bg) transition-all duration-200";
    if (isEditing) {
        return (
            <div className="p-1.5 bg-(--platform-card-bg) border border-(--platform-accent) rounded-lg mb-2 flex items-center gap-2">
                <div className="flex-1">
                    <Input 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        autoFocus
                        placeholder="Назва блоку"
                        disabled={isSaving}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(e);
                            if (e.key === 'Escape') handleCancelEdit(e);
                        }}
                        style={{ height: '32px', fontSize: '0.85rem' }}
                        wrapperStyle={{ marginBottom: 0 }}
                    />
                </div>
                <button 
                    onClick={handleSaveEdit} 
                    disabled={isSaving} 
                    className={`${actionBtnClasses} bg-(--platform-accent) text-white hover:bg-(--platform-accent-hover)`}
                >
                    <Check size={16} />
                </button>
                <button 
                    onClick={handleCancelEdit} 
                    disabled={isSaving} 
                    className={`${actionBtnClasses} border border-(--platform-border-color) hover:bg-(--platform-hover-bg)`}
                >
                    <X size={16} />
                </button>
            </div>
        );
    }
    return (
        <div 
            className="relative bg-(--platform-card-bg) border border-(--platform-border-color) rounded-lg mb-2 overflow-hidden flex items-center justify-between pr-2 transition-all duration-200 h-11.5 hover:border-(--platform-accent) hover:shadow-sm group"
        >
            <div className="flex-1 h-full min-w-0">
                <DraggableBlockItem
                    name={block.name}
                    icon={<Package size={16} />}
                    blockType={block.type}
                    presetData={{ 
                        isSavedBlock: true, 
                        content: block.content,
                        originId: block.id,
                        originName: block.name
                    }}
                    onClickAdd={onClickAdd}
                    customStyle={{
                        border: 'none', 
                        boxShadow: 'none', 
                        background: 'transparent', 
                        margin: 0, 
                        borderRadius: 0, 
                        height: '100%', 
                        width: '100%', 
                        padding: '0 0 0 12px',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                    customContent={
                         <div className="flex items-center gap-2.5 w-full overflow-hidden">
                            <span className="text-(--platform-text-secondary) cursor-grab"><GripVertical size={14} /></span>
                            <span className="text-(--platform-accent)"><Package size={16} /></span>
                            <span className="whitespace-nowrap overflow-hidden text-ellipsis text-sm font-medium">{block.name}</span>
                        </div>
                    }
                />
            </div>
            <div className="flex items-center gap-0.5 ml-2 z-10 shrink-0">
                <button 
                    onClick={handleStartEdit}
                    title="Перейменувати"
                    className={`${actionBtnClasses} hover:text-(--platform-accent)`}
                >
                    <Edit size={14} />
                </button>
                <button 
                    onClick={handleDeleteClick}
                    title="Видалити"
                    className={`${actionBtnClasses} hover:text-(--platform-danger) hover:bg-red-50`}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
};

const AddBlocksTab = ({ savedBlocksUpdateTrigger, blocks = [], onAddBlock }) => {
    const [savedBlocks, setSavedBlocks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { confirm } = useConfirm();
    const layoutBlocks = getBlocksByCategory('layout');
    const basicBlocks = getBlocksByCategory('basic');
    const ecommerceBlocks = getBlocksByCategory('ecommerce');
    const globalBlocks = getBlocksByCategory('global');
    useEffect(() => {
        const fetchSavedBlocks = async () => {
            setIsLoading(true);
            try {
                const res = await apiClient.get('/saved-blocks');
                setSavedBlocks(res.data);
            } catch (err) {
                console.error("Не вдалося завантажити збережені блоки", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSavedBlocks();
    }, [savedBlocksUpdateTrigger]);

    const handleDeleteSaved = async (e, id, name) => {
        const isConfirmed = await confirm({
            title: 'Видалити блок?',
            message: `Ви впевнені, що хочете видалити блок "${name}" з бібліотеки?`,
            type: 'danger',
            confirmLabel: 'Видалити'
        });
        if (isConfirmed) {
            try {
                await apiClient.delete(`/saved-blocks/${id}`);
                setSavedBlocks(prev => prev.filter(b => b.id !== id));
            } catch(err) {
                console.error(err);
            }
        }
    };
    const handleRenameSaved = async (id, newName) => {
        try {
            await apiClient.put(`/saved-blocks/${id}`, { name: newName });
            setSavedBlocks(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));
        } catch (err) {
            console.error(err);
        }
    };
    const handleBlockClickToAdd = (blockType, presetData = {}) => {
        if (!onAddBlock) return;
        if (blockType === 'global-header') {
            if (blocks.some(b => b.type === 'global-header')) {
                toast.warning('Глобальний Хедер вже додано на сторінку');
                return;
            }
            onAddBlock([0], blockType, presetData);
            scrollToBlock(0);
            return;
        }
        if (blockType === 'global-footer') {
            if (blocks.some(b => b.type === 'global-footer')) {
                toast.warning('Глобальний Футер вже додано на сторінку');
                return;
            }
            onAddBlock([blocks.length], blockType, presetData);
            scrollToBlock(blocks.length);
            return;
        }
        const footerIndex = blocks.findIndex(b => b.type === 'global-footer');
        const targetIndex = footerIndex !== -1 ? footerIndex : blocks.length;
        onAddBlock([targetIndex], blockType, presetData);
        scrollToBlock(targetIndex);
    };

    const scrollToBlock = (targetIndex) => {
        setTimeout(() => {
            const container = document.querySelector('.blocks-container');
            if (container) {
                const elements = Array.from(container.querySelectorAll('[id^="block-"]')).filter(el => {
                    return el.parentElement.classList.contains('site-theme-preview') || el.closest('.blocks-container') === container;
                });
                if (elements[targetIndex]) {
                    elements[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (targetIndex >= blocks.length) {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                }
            }
        }, 150);
    };

    return (
        <div>
            <Section title="Ваша бібліотека" defaultOpen={false} icon={<Package size={18} />}>
                {isLoading ? (
                    <div className="flex justify-center p-4 text-(--platform-text-secondary)">
                        <Loader2 size={24} className="animate-spin text-(--platform-accent)" />
                    </div>
                ) : savedBlocks.length === 0 ? (
                    <div className="p-6 border border-dashed border-(--platform-border-color) rounded-lg text-center text-(--platform-text-secondary) text-sm bg-(--platform-bg)">
                        Тут будуть ваші збережені варіанти блоків.
                    </div>
                ) : (
                    savedBlocks.map(block => (
                        <SavedBlockItem 
                            key={block.id} 
                            block={block} 
                            onDelete={handleDeleteSaved}
                            onRename={handleRenameSaved}
                            onClickAdd={handleBlockClickToAdd}
                        />
                    ))
                )}
            </Section>
            <Section title="Глобальні блоки" icon={<Globe size={18} />}>
                {globalBlocks.map(block => (
                    <DraggableBlockItem
                        key={block.type}
                        name={block.name}
                        icon={block.icon}
                        blockType={block.type}
                        onClickAdd={handleBlockClickToAdd}
                    />
                ))}
            </Section>
            <Section title="Макети" icon={<PanelTop size={18} />}>
                {layoutBlocks.map(block => (
                    block.presets.map(preset => (
                        <DraggableBlockItem
                            key={preset.preset}
                            name={preset.name}
                            icon={block.icon}
                            blockType="layout"
                            presetData={{ preset: preset.preset, columns: preset.columns }}
                            onClickAdd={handleBlockClickToAdd}
                        />
                    ))
                ))}
            </Section>
            <Section title="Базові блоки" icon={<Box size={18} />}>
                {basicBlocks.map(block => (
                    <DraggableBlockItem
                        key={block.type}
                        name={block.name}
                        icon={block.icon}
                        blockType={block.type}
                        onClickAdd={handleBlockClickToAdd}
                    />
                ))}
            </Section>
            <Section title="E-commerce" icon={<ShoppingBag size={18} />}>
                {ecommerceBlocks.map(block => (
                    <DraggableBlockItem
                        key={block.type}
                        name={block.name}
                        icon={block.icon}
                        blockType={block.type}
                        onClickAdd={handleBlockClickToAdd}
                    />
                ))}
            </Section>
        </div>
    );
};

export default AddBlocksTab;