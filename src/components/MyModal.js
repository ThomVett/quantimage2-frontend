import React from 'react';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';

export default function MyModal({ isOpen, toggle, title, children }) {
  return (
    <Modal
      isOpen={isOpen}
      toggle={toggle}
      size="lg"
      className="modal-dialog-centered"
    >
      <ModalHeader toggle={toggle}>{title}</ModalHeader>
      <ModalBody className="text-center">{children}</ModalBody>
    </Modal>
  );
}
